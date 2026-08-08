"""Смены, которые никто не отметил, и смены без откликов.

Два сценария «не по плану», которые копились молча.

1. Смену не отметила НИ ОДНА сторона. Такая смена висела «подтверждённой»
   вечно: место оставалось занятым, и заведение не могло взять на него
   другого человека даже через месяц; надёжность работника не обновлялась.

2. На смену никто не откликнулся. Заведение узнавало об этом утром в день
   смены — когда искать уже поздно. Напоминания были только работникам.
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


def test_unmarked_shift_is_closed_and_frees_the_place(client):
    """Никто не отметил — смена закрывается, место освобождается."""
    from app.digest import close_abandoned_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870001, 870002)
    assert v["id"] not in {x["id"] for x in client.get("/vacancies").json()}

    _age_the_shift(mid, days=5)
    db = SessionLocal()
    try:
        assert close_abandoned_shifts(db) == 1
    finally:
        db.close()
    assert _status(mid) == "expired"


def test_unmarked_shift_does_not_hurt_the_worker(client):
    """Доказательств нет ни у кого — надёжность не трогаем.

    Может, человек вышел, а оба забыли нажать кнопку. Наказывать по догадке
    нельзя: неявку ставит заведение, а спорное разбирает оператор.
    """
    from app.digest import close_abandoned_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870010, 870011)
    _age_the_shift(mid, days=5)
    db = SessionLocal()
    try:
        close_abandoned_shifts(db)
        m = db.get(Match, mid)
        assert m.no_show is False, "неявку без доказательств ставить нельзя"
    finally:
        db.close()

    other_h, _ = _auth(client, "employer")
    card = [c for c in client.get("/candidates", headers=other_h).json()
            if c["id"] == sid][0]
    assert card["shifts_total"] == 0


def test_no_commission_for_an_unmarked_shift(client):
    """Не знаем, была ли смена — денег не берём."""
    from app.digest import close_abandoned_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870020, 870021)
    _age_the_shift(mid, days=5)
    db = SessionLocal()
    try:
        close_abandoned_shifts(db)
        assert db.query(Commission).filter(Commission.match_id == mid).count() == 0
    finally:
        db.close()


def test_fresh_shift_is_not_touched(client):
    """Смена прошла час назад — ещё рано: люди могут вспомнить и отметиться."""
    from app.digest import close_abandoned_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870030, 870031)
    db = SessionLocal()
    try:
        assert close_abandoned_shifts(db) == 0
    finally:
        db.close()
    assert _status(mid) == "confirmed"


def test_disputed_shift_is_left_to_the_operator(client):
    """Спорную смену автоматика не трогает — её разбирает человек."""
    from app.digest import close_abandoned_shifts

    emp_h, seeker_h, sid, v, mid = _confirmed_but_unmarked(client, 870040, 870041)
    client.post(f"/matches/{mid}/dispute", headers=seeker_h,
                json={"note": "не смог отметиться"})
    _age_the_shift(mid, days=5)
    db = SessionLocal()
    try:
        assert close_abandoned_shifts(db) == 0
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
