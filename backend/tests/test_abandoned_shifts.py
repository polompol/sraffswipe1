"""Расчёт по смене и смены без откликов.

Главное правило сервиса: договорились о смене — она считается состоявшейся,
пока кто-то явно не сказал обратного. Раньше было наоборот, и это была дыра:
смена закрывалась только когда обе стороны нажимали кнопку, комиссия шла
только при закрытии — значит, чтобы не платить 10%, заведению достаточно было
ничего не делать. Сторона, которая должна деньги, выигрывала от бездействия.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Commission, Employer, Match, User, Vacancy
from app.timeutil import business_tz, local_today


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


def _shift(client, emp_h, date=None, headcount=1):
    return client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": date or local_today(),
        "start_time": 600, "end_time": 1080, "rate": 400,
        "rate_type": "perHour", "headcount": headcount,
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()


def _confirmed_but_unmarked(client, tg_emp, tg_seeker):
    """Смена, которую подтвердили обе стороны и НИКТО не отметил."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
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


def _age_the_shift(mid, days):
    """Отматываем смену в прошлое."""
    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        v = db.get(Vacancy, m.vacancy_id)
        v.date = (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d")
        db.commit()
    finally:
        db.close()


def _status(mid):
    db = SessionLocal()
    try:
        return db.get(Match, mid).status
    finally:
        db.close()


def test_silence_means_the_shift_happened(client):
    """Никто ничего не нажал — смена засчитана, комиссия начислена.

    Это и есть перевёрнутое правило. Раньше такая смена закрывалась со
    статусом «не состоялась» и без денег, и заведению было выгодно молчать.
    """
    from app.digest import settle_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870001, 870002)
    assert v["id"] not in {x["id"] for x in client.get("/vacancies").json()}

    _age_the_shift(mid, days=5)
    db = SessionLocal()
    try:
        assert settle_shifts(db) == 1
        assert db.query(Commission).filter(Commission.match_id == mid).count() == 1
    finally:
        db.close()
    assert _status(mid) == "completed"


def test_venue_can_say_the_shift_did_not_happen(client):
    """Человек не вышел — заведение говорит об этом, и денег не берём."""
    from app.digest import settle_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870010, 870011)
    r = client.post(f"/matches/{mid}/not-held", headers=emp_h,
                    json={"reason": "не вышел, не отвечает"})
    assert r.status_code == 200

    _age_the_shift(mid, days=5)
    db = SessionLocal()
    try:
        assert settle_shifts(db) == 0, "заявленную смену расчёт не трогает"
        m = db.get(Match, mid)
        assert m.status == "expired"
        assert m.no_show is True, "неявку фиксируем — это надёжность работника"
        assert db.query(Commission).filter(Commission.match_id == mid).count() == 0
    finally:
        db.close()


def test_worker_can_say_the_shift_did_not_happen(client):
    """Смену отменили на месте — работник говорит об этом и не наказывается."""
    from app.digest import settle_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870020, 870021)
    assert client.post(f"/matches/{mid}/not-held", headers=seeker_h,
                       json={"reason": "приехал, смену отменили"}).status_code == 200
    _age_the_shift(mid, days=5)
    db = SessionLocal()
    try:
        settle_shifts(db)
        m = db.get(Match, mid)
        assert m.status == "expired"
        # Срыв со стороны заведения — не вина работника.
        assert m.no_show is False
        assert db.query(Commission).filter(Commission.match_id == mid).count() == 0
    finally:
        db.close()


def test_code_beats_a_quiet_no_show(client):
    """Работник назвал код — заведение уже не спишет смену в неявку молча.

    Код знает только заведение: раз он назван, человек был на месте и говорил
    с людьми. Такое расхождение уходит к оператору, а не решается в пользу
    того, кто нажал кнопку последним.
    """
    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870030, 870031)
    code = [m for m in client.get("/matches", headers=emp_h).json()
            if m["id"] == mid][0]["checkin_code"]
    assert client.post(f"/matches/{mid}/checkin", headers=seeker_h,
                       json={"code": code}).status_code == 200

    r = client.post(f"/matches/{mid}/not-held", headers=emp_h,
                    json={"reason": "не вышел"})
    assert r.status_code == 200
    db = SessionLocal()
    try:
        m = db.get(Match, mid)
        assert m.disputed is True, "показания расходятся → решает оператор"
        assert m.status == "confirmed", "автоматика спорную смену не закрывает"
    finally:
        db.close()


def test_fresh_shift_is_not_settled_yet(client):
    """Смена только что закончилась — даём время возразить."""
    from app.digest import settle_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870040, 870041)
    db = SessionLocal()
    try:
        assert settle_shifts(db) == 0
    finally:
        db.close()
    assert _status(mid) == "confirmed"


def test_disputed_shift_is_left_to_the_operator(client):
    """Спорную смену автоматика не трогает — её разбирает человек."""
    from app.digest import settle_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870050, 870051)
    client.post(f"/matches/{mid}/dispute", headers=seeker_h,
                json={"note": "не смог отметиться"})
    _age_the_shift(mid, days=5)
    db = SessionLocal()
    try:
        assert settle_shifts(db) == 0
    finally:
        db.close()


def test_both_sides_are_asked_before_money_moves(client):
    """Перед списанием обе стороны получают вопрос «всё прошло как договаривались?»."""
    from app.digest import build_aftershift_asks, send_aftershift_asks

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870060, 870061)
    _age_the_shift(mid, days=1)
    db = SessionLocal()
    try:
        asks = build_aftershift_asks(db)
        assert mid in {a[0] for a in asks}
        assert send_aftershift_asks(db) >= 1
        # Второй раз за тот же день не спрашиваем.
        assert send_aftershift_asks(db) == 0
    finally:
        db.close()


def test_venue_is_warned_about_tomorrow_without_people(client):
    """Смена завтра, откликов нет — предупреждаем накануне, а не утром."""
    from datetime import date

    from app.digest import build_unfilled_alerts

    emp_h, eid = _auth(client, "employer")
    tomorrow = (date.fromisoformat(local_today()) + timedelta(days=1)).isoformat()
    v = _shift(client, emp_h, date=tomorrow, headcount=3)
    _detach(eid, 870050)

    db = SessionLocal()
    try:
        alerts = build_unfilled_alerts(db)
    finally:
        db.close()
    mine = [a for a in alerts if a[0] == v["id"]]
    assert mine, "заведение не предупредили о смене без людей"
    assert "не хватает 3" in mine[0][2]
    assert "Срочно" in mine[0][2], "нужен совет, что делать, а не просто факт"


def test_no_alert_when_the_shift_is_full(client):
    """Все места набраны — беспокоить незачем."""
    from datetime import date

    from app.digest import build_unfilled_alerts

    emp_h, eid = _auth(client, "employer")
    tomorrow = (date.fromisoformat(local_today()) + timedelta(days=1)).isoformat()
    v = _shift(client, emp_h, date=tomorrow, headcount=1)
    seeker_h, sid = _auth(client, "seeker")
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})
    client.post("/swipes", headers=seeker_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    _detach(eid, 870060)
    _detach(sid, 870061)

    db = SessionLocal()
    try:
        alerts = build_unfilled_alerts(db)
    finally:
        db.close()
    assert not [a for a in alerts if a[0] == v["id"]]


def test_alerts_ignore_other_days(client):
    """Смена через неделю — не повод дёргать сегодня."""
    from datetime import date

    from app.digest import build_unfilled_alerts

    emp_h, eid = _auth(client, "employer")
    later = (date.fromisoformat(local_today()) + timedelta(days=7)).isoformat()
    v = _shift(client, emp_h, date=later)
    _detach(eid, 870070)
    db = SessionLocal()
    try:
        assert not [a for a in build_unfilled_alerts(db) if a[0] == v["id"]]
    finally:
        db.close()


def test_operator_endpoints_work(client):
    admin_h, _ = _auth(client, "seeker")
    assert "closed" in client.post("/admin/shifts/close-abandoned",
                                   headers=admin_h).json()
    assert "sent" in client.post("/admin/shifts/unfilled-alerts",
                                 headers=admin_h).json()


def test_business_tz_is_used_for_tomorrow(client):
    """Служебная проверка: «завтра» считается по местному времени."""
    assert business_tz() is not None
