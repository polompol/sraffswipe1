"""Счётчик «Вас зовут» должен совпадать со списком за ним.

Раньше считались все лайки за всё время — включая те, где мэтч давно создан,
и по снятым и прошедшим сменам. Кнопка обещала «Вас зовут на смены: 4»,
человек нажимал, а в списке была одна. Врал только счётчик, но после такого
перестают верить всем цифрам в приложении.
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
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _shift(client, emp_h, days=2, role="waiter"):
    day = (datetime.now(UTC) + timedelta(days=days)).date().isoformat()
    return client.post("/vacancies", headers=emp_h, json={
        "role": role, "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61,
    }).json()


def _counter(client, headers) -> int:
    return client.get("/me", headers=headers).json()["incomingLikes"]


def test_the_number_matches_the_list_for_a_venue(client):
    emp_h, eid = _auth(client, "employer")
    a = _shift(client, emp_h, 2)
    b = _shift(client, emp_h, 3)
    _detach(eid, 920001)

    see_h, sid = _auth(client, "seeker")
    _detach(sid, 920002)
    # Один человек откликнулся на две смены — это один ответ, а не два.
    for v in (a, b):
        client.post("/swipes", headers=see_h, json={
            "target_id": v["id"], "target_type": "vacancy", "direction": "like"})

    assert _counter(client, emp_h) == 1
    assert len(client.get("/employer/applicants", headers=emp_h).json()) == 1


def test_answered_applicant_leaves_the_counter(client):
    """Ответили человеку — он уходит и из списка, и из счётчика."""
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 920010)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 920011)
    client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    assert _counter(client, emp_h) == 1

    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]})
    assert _counter(client, emp_h) == 0
    assert client.get("/employer/applicants", headers=emp_h).json() == []


def test_a_past_shift_no_longer_counts(client):
    emp_h, eid = _auth(client, "employer")
    v = _shift(client, emp_h)
    _detach(eid, 920020)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 920021)
    client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    assert _counter(client, emp_h) == 1

    db = SessionLocal()
    try:
        db.get(Vacancy, v["id"]).date = (
            date.fromisoformat(local_today()) - timedelta(days=1)
        ).isoformat()
        db.commit()
    finally:
        db.close()
    assert _counter(client, emp_h) == 0


def test_the_number_matches_the_list_for_a_worker(client):
    """У работника счётчик = сколько смен в «Кто меня зовёт»."""
    emp_h, eid = _auth(client, "employer")
    a = _shift(client, emp_h, 2)
    _shift(client, emp_h, 4, "barista")
    _detach(eid, 920030)

    see_h, sid = _auth(client, "seeker")
    _detach(sid, 920031)
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"})

    invites = client.get("/vacancies/invites", headers=see_h).json()
    assert _counter(client, see_h) == len(invites) == 2

    # Посмотрел одну смену — счётчик уменьшился вместе со списком.
    client.post("/swipes", headers=see_h, json={
        "target_id": a["id"], "target_type": "vacancy", "direction": "dislike"})
    invites = client.get("/vacancies/invites", headers=see_h).json()
    assert _counter(client, see_h) == len(invites) == 1
