"""Мэтч должен создаваться на ТУ смену, о которой идёт речь.

У заведения обычно несколько смен, и человек может откликнуться на несколько
сразу. Раньше сервер брал «первую попавшуюся» из базы: заведение жало «Беру
на смену» под карточкой, где написано «Бариста · 19 августа», а мэтч мог
получиться на бармена двадцатого. Разные день, время и деньги — и обе стороны
узнавали об этом уже на месте.
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


def _shift(client, emp_h, days_ahead: int, role: str, start: int = 600):
    day = (datetime.now(UTC) + timedelta(days=days_ahead)).date().isoformat()
    return client.post("/vacancies", headers=emp_h, json={
        "role": role, "date": day, "start_time": start,
        "end_time": (start + 480) % 1440, "rate": 400, "rate_type": "perHour",
        "city": "Москва", "lat": 55.75, "lng": 37.61,
    }).json()


def _match_vacancy(match_id: str) -> str:
    from app.models import Match

    db = SessionLocal()
    try:
        return db.get(Match, match_id).vacancy_id
    finally:
        db.close()


def test_match_is_created_for_the_named_shift(client):
    """Заведение назвало смену — мэтч ровно по ней, а не по соседней."""
    emp_h, eid = _auth(client, "employer")
    a = _shift(client, emp_h, 2, "barista")
    b = _shift(client, emp_h, 3, "bartender")
    _detach(eid, 930001)

    see_h, sid = _auth(client, "seeker")
    _detach(sid, 930002)
    for v in (a, b):
        client.post("/swipes", headers=see_h, json={
            "target_id": v["id"], "target_type": "vacancy", "direction": "like"})

    r = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": b["id"],
    }).json()
    assert r["matched"] is True
    assert _match_vacancy(r["match_id"]) == b["id"], (
        "мэтч должен быть на названную смену"
    )


def test_without_a_named_shift_the_nearest_one_wins(client):
    """В ленте кандидатов смену выбрать негде — берём ближайшую по времени."""
    emp_h, eid = _auth(client, "employer")
    later = _shift(client, emp_h, 5, "bartender")
    sooner = _shift(client, emp_h, 1, "barista")
    _detach(eid, 930010)

    see_h, sid = _auth(client, "seeker")
    _detach(sid, 930011)
    for v in (later, sooner):
        client.post("/swipes", headers=see_h, json={
            "target_id": v["id"], "target_type": "vacancy", "direction": "like"})

    r = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"}).json()
    assert _match_vacancy(r["match_id"]) == sooner["id"]


def test_a_past_shift_never_becomes_a_match(client):
    """Вчерашняя смена не должна становиться мэтчем ни при каком выборе."""
    emp_h, eid = _auth(client, "employer")
    past = _shift(client, emp_h, 2, "barista")
    _detach(eid, 930020)
    see_h, sid = _auth(client, "seeker")
    _detach(sid, 930021)
    client.post("/swipes", headers=see_h, json={
        "target_id": past["id"], "target_type": "vacancy", "direction": "like"})

    # Смена уезжает во вчера уже ПОСЛЕ отклика — так бывает: человек откликнулся,
    # заведение ответило через два дня.
    db = SessionLocal()
    try:
        db.get(Vacancy, past["id"]).date = (
            date.fromisoformat(local_today()) - timedelta(days=1)
        ).isoformat()
        db.commit()
    finally:
        db.close()

    r = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like"}).json()
    assert r["matched"] is False, "мэтч на прошедшую смену не создаётся"


def test_a_named_shift_of_another_venue_is_refused(client):
    """Чужую смену назвать нельзя — даже если знаешь её номер."""
    emp_h, eid = _auth(client, "employer")
    _detach(eid, 930030)
    other_h, oid = _auth(client, "employer")
    theirs = _shift(client, other_h, 2, "barista")
    _detach(oid, 930031)

    see_h, sid = _auth(client, "seeker")
    _detach(sid, 930032)
    client.post("/swipes", headers=see_h, json={
        "target_id": theirs["id"], "target_type": "vacancy", "direction": "like"})

    r = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": theirs["id"],
    })
    assert r.status_code == 404


def test_naming_a_shift_the_person_did_not_choose_gives_no_match(client):
    """Человек откликнулся на смену А, заведение зовёт на Б — взаимности нет.

    Раньше в этом случае сервер молча создавал мэтч по смене А: получалось,
    что заведение позвало человека на день, о котором даже не думало.
    """
    emp_h, eid = _auth(client, "employer")
    a = _shift(client, emp_h, 2, "barista")
    b = _shift(client, emp_h, 4, "cook")
    _detach(eid, 930040)

    see_h, sid = _auth(client, "seeker")
    _detach(sid, 930041)
    client.post("/swipes", headers=see_h, json={
        "target_id": a["id"], "target_type": "vacancy", "direction": "like"})

    r = client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": b["id"],
    }).json()
    assert r["matched"] is False
