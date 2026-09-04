"""«Готов выйти сегодня» должно значить именно сегодня.

Отметка была галочкой и жила вечно: нажал в августе, забыл выключить — и в
сентябре всё ещё висишь первым в ленте кандидатов и получаешь рассылки «нужен
человек сегодня». Заведение звало людей, которые давно не собирались выходить,
а человек получал уведомления, о которых не просил.
"""
from datetime import date, timedelta

from app.db import SessionLocal
from app.models import Employer, User
from app.timeutil import local_today


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id, tg_id, city="Москва"):
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        o.city = city
        db.commit()
    finally:
        db.close()


def _rewind(user_id: str, days: int) -> None:
    """Сделать вид, что отметку поставили `days` дней назад."""
    db = SessionLocal()
    try:
        u = db.get(User, user_id)
        u.available_date = (
            date.fromisoformat(local_today()) - timedelta(days=days)
        ).isoformat()
        db.commit()
    finally:
        db.close()


def test_the_mark_is_on_today(client):
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 950001)
    r = client.post("/me/available", headers=see_h, json={"available": True})
    assert r.json()["availableToday"] is True
    assert client.get("/me", headers=see_h).json()["availableToday"] is True


def test_the_mark_goes_out_by_itself_the_next_day(client):
    """Главное: назавтра отметка гаснет сама, без уборки по расписанию."""
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 950010)
    client.post("/me/available", headers=see_h, json={"available": True})
    _rewind(sid, 1)
    assert client.get("/me", headers=see_h).json()["availableToday"] is False


def test_yesterdays_mark_does_not_lift_a_person_in_the_feed(client):
    """Вчерашняя готовность не должна ставить человека первым сегодня."""
    fresh_h, fresh_id = _auth(client, "seeker")
    client.put("/me", headers=fresh_h, json={"name": "Сегодняшний", "city": "Москва"})
    _detach(fresh_id, 950020)
    client.post("/me/available", headers=fresh_h, json={"available": True})

    stale_h, stale_id = _auth(client, "seeker")
    client.put("/me", headers=stale_h, json={"name": "Вчерашний", "city": "Москва"})
    _detach(stale_id, 950021)
    client.post("/me/available", headers=stale_h, json={"available": True})
    _rewind(stale_id, 3)

    emp_h, eid = _auth(client, "employer")
    _detach(eid, 950022)

    rows = client.get("/candidates?available_today=true", headers=emp_h).json()
    ids = [r["id"] for r in rows]
    assert fresh_id in ids
    assert stale_id not in ids, "вчерашняя отметка не должна попадать в «готов сегодня»"

    # А в общей ленте вчерашний остаётся, просто без пометки.
    all_rows = client.get("/candidates", headers=emp_h).json()
    stale = next(r for r in all_rows if r["id"] == stale_id)
    assert stale["available_today"] is False


def test_turning_it_off_works(client):
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 950030)
    client.post("/me/available", headers=see_h, json={"available": True})
    r = client.post("/me/available", headers=see_h, json={"available": False})
    assert r.json()["availableToday"] is False
