"""Отмена смены — самое частое событие в подработке.

До этого отмены не было ВООБЩЕ. Заболел, передумал, планы поменялись —
оставался ровно один способ: не прийти. То есть человек, честно
предупредивший за два дня, получал ту же отметку «неявка», что и пропавший
молча, а заведение узнавало обо всём в день смены. Место при этом оставалось
занятым, и заменить человека было нельзя.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Employer, Match, User, Vacancy
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


def _shift_in(client, emp_h, hours_from_now: int, headcount=1):
    """Смена, начинающаяся через N часов по местному времени."""
    from app.timeutil import business_tz

    start = datetime.now(UTC).astimezone(business_tz()) + timedelta(
        hours=hours_from_now)
    return client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": start.date().isoformat(),
        "start_time": start.hour * 60 + start.minute,
        "end_time": (start.hour * 60 + start.minute + 480) % 1440,
        "rate": 400, "rate_type": "perHour", "headcount": headcount,
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()


def _matched(client, tg_emp, tg_seeker, hours=48, headcount=1):
    emp_h, eid = _auth(client, "employer")
    v = _shift_in(client, emp_h, hours, headcount)
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    sw = client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy",
        "direction": "like"}).json()
    _detach(eid, tg_emp)
    _detach(sid, tg_seeker)
    return emp_h, seeker_h, sid, v, sw["match_id"]


def _status(mid):
    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        return m.status, m.cancelled_by, m.cancelled_late
    finally:
        db.close()


def test_worker_can_cancel_and_the_place_frees_up(client):
    """Отказался заранее — смена вернулась в ленту, место снова свободно."""
    emp_h, seeker_h, sid, v, mid = _matched(client, 860001, 860002)
    assert v["id"] not in {x["id"] for x in client.get("/vacancies").json()}

    r = client.post(f"/matches/{mid}/cancel", headers=seeker_h,
                    json={"reason": "заболел"})
    assert r.status_code == 200, r.text
    assert _status(mid) == ("cancelled", "seeker", False)
    assert v["id"] in {x["id"] for x in client.get("/vacancies").json()}


def test_venue_can_cancel_too(client):
    """Заведение тоже отменяет — банкет отменился, люди не нужны."""
    emp_h, seeker_h, sid, v, mid = _matched(client, 860010, 860011)
    r = client.post(f"/matches/{mid}/cancel", headers=emp_h,
                    json={"reason": "банкет отменился"})
    assert r.status_code == 200
    assert _status(mid)[:2] == ("cancelled", "employer")


def test_early_cancel_does_not_hurt_reliability(client):
    """Главное правило: предупредил заранее — не наказан.

    Иначе честность бессмысленна: проще молча не прийти.
    """
    emp_h, seeker_h, sid, v, mid = _matched(client, 860020, 860021, hours=48)
    client.post(f"/matches/{mid}/cancel", headers=seeker_h,
                json={"reason": "нашёл постоянную работу"})

    other_h, _ = _auth(client, "employer")
    card = [c for c in client.get("/candidates", headers=other_h).json()
            if c["id"] == sid]
    assert card, "профиль пропал из ленты"
    assert card[0]["shifts_total"] == 0, "ранняя отмена не должна попадать в статистику"


def test_late_cancel_counts_as_letting_down(client):
    """Отмена за час до смены — заведение уже не найдёт замену."""
    emp_h, seeker_h, sid, v, mid = _matched(client, 860030, 860031, hours=2)
    r = client.post(f"/matches/{mid}/cancel", headers=seeker_h, json={})
    assert r.status_code == 200
    assert _status(mid) == ("cancelled", "seeker", True)

    other_h, _ = _auth(client, "employer")
    card = [c for c in client.get("/candidates", headers=other_h).json()
            if c["id"] == sid][0]
    assert card["shifts_total"] == 1
    assert card["shifts_attended"] == 0, "поздняя отмена = подвёл"


def test_cannot_cancel_after_checkin(client):
    """Смена началась — отменять поздно, для этого есть спор."""
    emp_h, seeker_h, sid, v, mid = _matched(client, 860040, 860041, hours=1)
    rows = client.get("/matches", headers=emp_h).json()
    client.post(f"/matches/{mid}/confirm", headers=seeker_h)
    client.post(f"/matches/{mid}/confirm", headers=emp_h)
    rows = client.get("/matches", headers=emp_h).json()
    code = [m for m in rows if m["id"] == mid][0]["checkin_code"]
    client.post(f"/matches/{mid}/checkin", headers=seeker_h, json={"code": code})

    r = client.post(f"/matches/{mid}/cancel", headers=seeker_h, json={})
    assert r.status_code == 409
    assert "уже началась" in r.json()["detail"]


def test_cannot_cancel_twice(client):
    emp_h, seeker_h, sid, v, mid = _matched(client, 860050, 860051)
    client.post(f"/matches/{mid}/cancel", headers=seeker_h, json={})
    r = client.post(f"/matches/{mid}/cancel", headers=seeker_h, json={})
    assert r.status_code == 409


def test_outsider_cannot_cancel(client):
    emp_h, seeker_h, sid, v, mid = _matched(client, 860060, 860061)
    other_h, other = _auth(client, "seeker")
    _detach(other, 860062)
    r = client.post(f"/matches/{mid}/cancel", headers=other_h, json={})
    assert r.status_code == 403


def test_no_commission_for_a_cancelled_shift(client):
    """Отменённая смена не порождает комиссию: услуги не было."""
    from app.models import Commission

    emp_h, seeker_h, sid, v, mid = _matched(client, 860070, 860071)
    client.post(f"/matches/{mid}/cancel", headers=emp_h, json={})
    db = SessionLocal()
    try:
        assert db.query(Commission).filter(Commission.match_id == mid).count() == 0
    finally:
        db.close()


def test_cancelled_shift_stops_blocking_the_slot_for_others(client):
    """После отказа заведение может взять другого человека на это место."""
    emp_h, seeker_h, sid, v, mid = _matched(client, 860080, 860081, headcount=1)
    client.post(f"/matches/{mid}/cancel", headers=seeker_h, json={})

    new_h, new_id = _auth(client, "seeker")
    client.post("/swipes", headers=new_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    r = client.post("/swipes", headers=emp_h, json={
        "target_id": new_id, "target_type": "user", "direction": "like"})
    assert r.status_code == 200 and r.json()["matched"] is True


def test_cancel_is_visible_in_chat(client):
    """В чате остаётся системная запись: кто отменил и почему."""
    emp_h, seeker_h, sid, v, mid = _matched(client, 860090, 860091)
    client.post(f"/matches/{mid}/cancel", headers=seeker_h,
                json={"reason": "сломал руку"})
    msgs = client.get(f"/matches/{mid}/messages", headers=emp_h).json()
    texts = " ".join(m["text"] for m in msgs if m["is_system"])
    assert "отменена" in texts and "сломал руку" in texts


def test_vacancy_date_is_today(client):
    """Служебная проверка помощника: смена создаётся на сегодня/завтра."""
    emp_h, _ = _auth(client, "employer")
    v = _shift_in(client, emp_h, 3)
    db = SessionLocal()
    try:
        assert db.get(Vacancy, v["id"]).date >= local_today()
    finally:
        db.close()
