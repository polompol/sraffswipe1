"""Свайп по «мёртвой» цели: прошедшая смена, снятая смена, бан.

Из ленты такие карточки исчезают — но свайп можно прислать напрямую, с любым
id: карточка, открытая час назад, ссылка, простой скрипт. Раньше проверялось
только «такая запись существует», и отклик доходил до мэтча и чата по смене,
которой уже нет: человек договаривается о работе, которой не будет, а
заведение ждёт его на смене, которую сняли.
"""
from datetime import UTC, date, datetime, timedelta

from app.db import SessionLocal
from app.models import Employer, User, Vacancy
from app.timeutil import local_today


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id, tg_id):
    """Развести аккаунты по разным Telegram-id: вход без init_data выдаёт
    одного и того же человека, пока tg_id совпадает."""
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _shift(client, emp_h, day=None):
    day = day or (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    return client.post("/vacancies", headers=emp_h, json={
        "role": "waiter", "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()


def _swipe(client, headers, target_id, target_type="vacancy"):
    return client.post("/swipes", headers=headers, json={
        "target_id": target_id, "target_type": target_type, "direction": "like",
    })


def test_a_past_shift_cannot_be_swiped(client):
    """Вчерашняя смена остаётся «активной», пока её не снимут руками."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 990001)

    db = SessionLocal()
    try:
        db.get(Vacancy, v["id"]).date = (
            date.fromisoformat(local_today()) - timedelta(days=1)
        ).isoformat()
        db.commit()
    finally:
        db.close()

    see_h, _ = _auth(client, "seeker")
    r = _swipe(client, see_h, v["id"])
    assert r.status_code == 409, r.text
    assert "прошла" in r.json()["detail"]


def test_a_withdrawn_shift_cannot_be_swiped(client):
    """Смена снята с публикации (или заблокирована оператором)."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 990002)

    db = SessionLocal()
    try:
        db.get(Vacancy, v["id"]).status = "blocked"
        db.commit()
    finally:
        db.close()

    see_h, _ = _auth(client, "seeker")
    assert _swipe(client, see_h, v["id"]).status_code == 404


def test_a_shift_of_a_blocked_venue_cannot_be_swiped(client):
    """Бан переводит смены в blocked, но оператор может разблокировать смену
    отдельно — и она оживёт у заблокированного владельца."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 990003)

    db = SessionLocal()
    try:
        db.get(Employer, eid).blocked = True
        db.get(Vacancy, v["id"]).status = "active"
        db.commit()
    finally:
        db.close()

    see_h, _ = _auth(client, "seeker")
    assert _swipe(client, see_h, v["id"]).status_code == 404


def test_a_blocked_person_cannot_be_invited(client):
    """Заблокированный не пройдёт вход, а заведение будет ждать его на смене."""
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 990004)
    db = SessionLocal()
    try:
        db.get(User, sid).blocked = True
        db.commit()
    finally:
        db.close()

    emp_h, _ = _auth(client, "employer")
    assert _swipe(client, emp_h, sid, "user").status_code == 404


def test_a_made_up_id_is_not_recorded(client):
    """Несуществующая цель — отказ, а не запись свайпа «в никуда»."""
    from app.models import Swipe

    see_h, _ = _auth(client, "seeker")
    assert _swipe(client, see_h, "нет-такой-смены").status_code == 404
    db = SessionLocal()
    try:
        assert db.query(Swipe).filter(
            Swipe.target_id == "нет-такой-смены"
        ).count() == 0
    finally:
        db.close()


def test_a_normal_shift_still_works(client):
    """Проверки не должны мешать обычному отклику."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 990005)
    see_h, _ = _auth(client, "seeker")
    r = _swipe(client, see_h, v["id"])
    assert r.status_code == 200, r.text
    assert r.json()["recorded"] is True
