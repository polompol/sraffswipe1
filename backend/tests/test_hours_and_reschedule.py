"""Фактические часы, перенос смены и счётчик отмен.

Три сценария «пошло не по плану», которые раньше решались только перепиской
и ручными правками оператора.
"""
from datetime import date, timedelta

from app.db import SessionLocal
from app.models import Commission, Employer, Match, User, Vacancy
from app.timeutil import local_today


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id, tg_id):
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        if (o.phone or "").startswith("tg:"):
            o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _pair(client, tg_emp, tg_seeker, rate=400, rate_type="perHour", headcount=1):
    """Пара с подтверждённой сменой 10:00–18:00 (8 часов)."""
    emp_h, eid = _auth(client, "employer")
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": local_today(), "start_time": 600,
        "end_time": 1080, "rate": rate, "rate_type": rate_type,
        "headcount": headcount,
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    mid = client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()["match_id"]
    client.post(f"/matches/{mid}/confirm", headers=seeker_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)
    _detach(eid, tg_emp)
    _detach(sid, tg_seeker)
    return emp_h, seeker_h, sid, v, mid


def _age(match_id: str, days: int = 0) -> None:
    """Домотать смену до конца: закрыть её раньше окончания уже нельзя."""
    from .shifttime import age_shift

    age_shift(match_id, days)


def _close(client, emp_h, seeker_h, mid):
    _age(mid)
    rows = client.get("/matches", headers=emp_h).json()
    code = [m for m in rows if m["id"] == mid][0]["checkin_code"]
    client.post(f"/matches/{mid}/checkin", headers=seeker_h, json={"code": code})
    client.post(f"/matches/{mid}/attendance", headers=emp_h,
                json={"attended": True})


def _commission(mid):
    db = SessionLocal()
    try:
        return db.query(Commission).filter(Commission.match_id == mid).first()
    finally:
        db.close()


# ---------- фактические часы ----------

def test_short_shift_reduces_pay_and_commission(client):
    """Ушёл через 4 часа вместо 8 — платим и берём комиссию по факту."""
    emp_h, seeker_h, sid, v, mid = _pair(client, 880001, 880002)
    _age(mid)
    r = client.post(f"/matches/{mid}/hours", headers=emp_h,
                    json={"minutes": 240, "note": "отпустили раньше"})
    assert r.status_code == 200, r.text
    assert r.json()["shift_pay"] == 1600      # 4 ч × 400 ₽

    _close(client, emp_h, seeker_h, mid)
    c = _commission(mid)
    assert c.shift_pay == 1600
    assert c.amount == 160, "комиссия считается от фактической оплаты"


def test_worker_sees_the_change(client):
    """Молча уменьшать оплату нельзя — человек должен видеть и мочь спорить."""
    emp_h, seeker_h, sid, v, mid = _pair(client, 880010, 880011)
    _age(mid)
    client.post(f"/matches/{mid}/hours", headers=emp_h,
                json={"minutes": 300, "note": "ушёл раньше"})
    msgs = client.get(f"/matches/{mid}/messages", headers=seeker_h).json()
    text = " ".join(m["text"] for m in msgs if m["is_system"])
    assert "фактическую длительность" in text
    assert "5.0 ч" in text
    assert "ушёл раньше" in text
    assert "Проблема" in text, "человеку нужно объяснить, как не согласиться"


def test_longer_shift_increases_pay(client):
    """Задержался — платим больше, а не «как договаривались»."""
    emp_h, seeker_h, sid, v, mid = _pair(client, 880020, 880021)
    _age(mid)
    r = client.post(f"/matches/{mid}/hours", headers=emp_h, json={"minutes": 600})
    assert r.json()["shift_pay"] == 4000      # 10 ч × 400 ₽


def test_per_shift_rate_is_not_recalculated(client):
    """Посменная оплата от часов не зависит: договорились на смену целиком."""
    emp_h, seeker_h, sid, v, mid = _pair(
        client, 880030, 880031, rate=3000, rate_type="perShift")
    _age(mid)
    r = client.post(f"/matches/{mid}/hours", headers=emp_h, json={"minutes": 240})
    assert r.json()["shift_pay"] == 3000


def test_paid_commission_is_not_touched(client):
    """С оплаченной комиссии пересчёт не делаем: деньги уже прошли."""
    from app.routers.billing import credit_wallet

    emp_h, seeker_h, sid, v, mid = _pair(client, 880040, 880041)
    db = SessionLocal()
    try:
        eid = db.get(Match, mid).employer_id
        credit_wallet(db, eid, 10000, "аванс")
    finally:
        db.close()
    _close(client, emp_h, seeker_h, mid)
    before = _commission(mid)
    assert before.status == "paid" and before.amount == 320

    client.post(f"/matches/{mid}/hours", headers=emp_h, json={"minutes": 120})
    after = _commission(mid)
    assert after.amount == 320, "оплаченную комиссию пересчитывать нельзя"


def test_only_employer_sets_hours(client):
    emp_h, seeker_h, sid, v, mid = _pair(client, 880050, 880051)
    _age(mid)
    r = client.post(f"/matches/{mid}/hours", headers=seeker_h,
                    json={"minutes": 600})
    assert r.status_code == 403


def test_absurd_hours_are_rejected(client):
    emp_h, seeker_h, sid, v, mid = _pair(client, 880060, 880061)
    for bad in (5, 2000):
        assert client.post(f"/matches/{mid}/hours", headers=emp_h,
                           json={"minutes": bad}).status_code == 422


# ---------- перенос смены ----------

def _tomorrow():
    return (date.fromisoformat(local_today()) + timedelta(days=1)).isoformat()


def test_reschedule_needs_the_workers_consent(client):
    """Условия смены человек уже принял — менять их односторонне нельзя."""
    emp_h, seeker_h, sid, v, mid = _pair(client, 880070, 880071)
    new_day = _tomorrow()
    r = client.post(f"/matches/{mid}/reschedule", headers=emp_h, json={
        "date": new_day, "start_time": 720, "end_time": 1200})
    assert r.status_code == 200

    db = SessionLocal()
    try:
        assert db.get(Vacancy, v["id"]).date == local_today(), (
            "смена не должна меняться до согласия работника"
        )
    finally:
        db.close()

    assert client.post(f"/matches/{mid}/reschedule/accept",
                       headers=seeker_h).status_code == 200
    db = SessionLocal()
    try:
        moved = db.get(Vacancy, v["id"])
        assert moved.date == new_day
        assert moved.start_time == 720 and moved.end_time == 1200
    finally:
        db.close()


def test_worker_can_decline_and_the_shift_stays(client):
    """Отказ от переноса — не отмена: изначальная договорённость в силе."""
    emp_h, seeker_h, sid, v, mid = _pair(client, 880080, 880081)
    client.post(f"/matches/{mid}/reschedule", headers=emp_h, json={
        "date": _tomorrow(), "start_time": 720, "end_time": 1200})
    r = client.post(f"/matches/{mid}/reschedule/decline", headers=seeker_h)
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"

    db = SessionLocal()
    try:
        assert db.get(Vacancy, v["id"]).date == local_today()
    finally:
        db.close()


def test_cannot_reschedule_a_shift_with_other_people(client):
    """Перенос ударил бы по тем, кто ни о чём не договаривался."""
    emp_h, seeker_h, sid, v, mid = _pair(client, 880090, 880091, headcount=2)
    second_h, second_id = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": second_id, "target_type": "user", "direction": "like"})
    client.post("/swipes", headers=second_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    _detach(second_id, 880092)

    r = client.post(f"/matches/{mid}/reschedule", headers=emp_h, json={
        "date": _tomorrow(), "start_time": 720, "end_time": 1200})
    assert r.status_code == 409
    assert "другие люди" in r.json()["detail"]


def test_cannot_reschedule_after_checkin(client):
    emp_h, seeker_h, sid, v, mid = _pair(client, 880100, 880101)
    _close(client, emp_h, seeker_h, mid)
    r = client.post(f"/matches/{mid}/reschedule", headers=emp_h, json={
        "date": _tomorrow(), "start_time": 720, "end_time": 1200})
    assert r.status_code == 409


def test_accept_without_a_proposal_is_404(client):
    emp_h, seeker_h, sid, v, mid = _pair(client, 880110, 880111)
    assert client.post(f"/matches/{mid}/reschedule/accept",
                       headers=seeker_h).status_code == 404


# ---------- счётчик отмен ----------

def test_operator_sees_who_cancels_systematically(client):
    """Одна отмена — жизнь. Пять поздних — поведение, которое надо видеть."""
    from datetime import UTC, datetime
    from datetime import timedelta as _td

    emp_h, seeker_h, sid, v, mid = _pair(client, 880120, 880121)
    client.post(f"/matches/{mid}/cancel", headers=seeker_h, json={})
    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        m.cancelled_late = True          # как будто отменил за час
        m.created_at = datetime.now(UTC) - _td(days=1)
        db.commit()
    finally:
        db.close()

    admin_h, _ = _auth(client, "seeker")
    rows = client.get("/admin/cancel-stats", headers=admin_h).json()
    mine = [r for r in rows if r["ownerId"] == sid]
    assert mine, "отмена не попала в статистику"
    assert mine[0]["cancels"] == 1 and mine[0]["lateCancels"] == 1
    assert mine[0]["role"] == "seeker"


def test_cancel_stats_requires_admin(client):
    emp_h, _ = _auth(client, "employer")
    _detach(_auth(client, "employer")[1], 880130)
    r = client.get("/admin/cancel-stats", headers=emp_h)
    assert r.status_code in (401, 403)


def test_reschedule_rejects_past_and_zero_length(client):
    """Перенос шёл мимо проверок публикации: во вчера и «с 10:00 до 10:00».

    Второе для почасовой смены означает «ночная через полночь» — то есть
    24 часа: оплата и комиссия вырастали втрое от одной опечатки.
    """
    emp_h, _seeker_h, _sid, _v, mid = _pair(client, 7401, 7402)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    past = client.post(
        f"/matches/{mid}/reschedule", headers=emp_h,
        json={"date": yesterday, "start_time": 600, "end_time": 1080},
    )
    assert past.status_code == 422

    zero = client.post(
        f"/matches/{mid}/reschedule", headers=emp_h,
        json={"date": tomorrow, "start_time": 600, "end_time": 600},
    )
    assert zero.status_code == 422

    ok = client.post(
        f"/matches/{mid}/reschedule", headers=emp_h,
        json={"date": tomorrow, "start_time": 600, "end_time": 1080},
    )
    assert ok.status_code == 200
