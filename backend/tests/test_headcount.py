"""Несколько человек на одну смену.

Банкет, выходные, инвентаризация — там почти всегда нужен не один человек.
Поля «сколько нужно» не было вовсе: заведение публиковало пять одинаковых
объявлений, соискатель не понимал, сколько мест, а набранная смена висела в
ленте, пока её не снимут руками.
"""
from app.timeutil import local_today


def _auth(client, role):
    t = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {t['access_token']}"}, t["user_id"]


def _detach(owner_id: str, tg_id: int) -> None:
    from app.db import SessionLocal
    from app.models import Employer, User

    db = SessionLocal()
    try:
        obj = db.get(User, owner_id) or db.get(Employer, owner_id)
        obj.tg_id = tg_id
        if (obj.phone or "").startswith("tg:"):
            obj.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _vacancy(client, headers, headcount=1):
    return client.post("/vacancies", headers=headers, json={
        "role": "waiter", "date": local_today(), "start_time": 660,
        "end_time": 1380, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
        "headcount": headcount,
    }).json()


def _hire(client, emp_h, vac_id, tg_id):
    """Довести одного соискателя до мэтча по смене."""
    h, uid = _auth(client, "seeker")
    client.post("/swipes", headers=h, json={
        "target_id": vac_id, "target_type": "vacancy", "direction": "like"})
    r = client.post("/swipes", headers=emp_h, json={
        "target_id": uid, "target_type": "user", "direction": "like"}).json()
    _detach(uid, tg_id)
    return r


def test_shift_for_five_shows_remaining_slots(client):
    """Соискатель видит, сколько мест осталось."""
    emp_h, emp_id = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=5)
    _detach(emp_id, 810001)
    assert vac["headcount"] == 5
    assert vac["slots_left"] == 5

    _hire(client, emp_h, vac["id"], 810002)
    feed = client.get("/vacancies").json()
    card = [v for v in feed if v["id"] == vac["id"]][0]
    assert card["headcount"] == 5
    assert card["slots_left"] == 4


def test_filled_shift_leaves_the_feed(client):
    """Набрали всех — смена уходит из ленты, отклик на неё бессмыслен."""
    emp_h, emp_id = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=2)
    _detach(emp_id, 810010)

    _hire(client, emp_h, vac["id"], 810011)
    assert vac["id"] in {v["id"] for v in client.get("/vacancies").json()}

    _hire(client, emp_h, vac["id"], 810012)
    assert vac["id"] not in {v["id"] for v in client.get("/vacancies").json()}
    # У заведения смена остаётся — это его история и его набор.
    mine = client.get("/vacancies", params={"mine": 1}, headers=emp_h).json()
    card = [v for v in mine if v["id"] == vac["id"]][0]
    assert card["slots_left"] == 0


def test_no_show_frees_the_slot(client):
    """Неявка освобождает место: заведению снова нужен человек."""
    from app.db import SessionLocal
    from app.models import Match

    emp_h, emp_id = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=1)
    _detach(emp_id, 810020)
    res = _hire(client, emp_h, vac["id"], 810021)
    assert vac["id"] not in {v["id"] for v in client.get("/vacancies").json()}

    db = SessionLocal()
    try:
        m = db.get(Match, res["match_id"])
        m.no_show = True
        db.commit()
    finally:
        db.close()
    assert vac["id"] in {v["id"] for v in client.get("/vacancies").json()}


def test_can_add_people_after_first_response(client):
    """«Нужен ещё один» разрешено даже когда отклик уже есть: у того, кто
    согласился, ставка и время не меняются."""
    emp_h, emp_id = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=1)
    _detach(emp_id, 810030)
    _hire(client, emp_h, vac["id"], 810031)

    body = {
        "role": "waiter", "date": local_today(), "start_time": 660,
        "end_time": 1380, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
        "headcount": 3,
    }
    r = client.put(f"/vacancies/{vac['id']}", headers=emp_h, json=body)
    assert r.status_code == 200, r.text
    assert r.json()["headcount"] == 3
    # И смена возвращается в ленту: места снова есть.
    assert vac["id"] in {v["id"] for v in client.get("/vacancies").json()}


def test_cannot_change_rate_under_cover_of_headcount(client):
    """Главная защита остаётся: ставку под видом «добавлю людей» не поменять."""
    emp_h, emp_id = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=1)
    _detach(emp_id, 810040)
    _hire(client, emp_h, vac["id"], 810041)

    r = client.put(f"/vacancies/{vac['id']}", headers=emp_h, json={
        "role": "waiter", "date": local_today(), "start_time": 660,
        "end_time": 1380, "rate": 100, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
        "headcount": 3,
    })
    assert r.status_code == 409


def test_cannot_need_fewer_people_than_already_hired(client):
    """Нельзя объявить, что нужно меньше, чем уже набрано."""
    emp_h, emp_id = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=3)
    _detach(emp_id, 810050)
    _hire(client, emp_h, vac["id"], 810051)
    _hire(client, emp_h, vac["id"], 810052)

    r = client.put(f"/vacancies/{vac['id']}", headers=emp_h, json={
        "role": "waiter", "date": local_today(), "start_time": 660,
        "end_time": 1380, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
        "headcount": 1,
    })
    assert r.status_code == 409
    assert "уже взято" in r.json()["detail"]


def test_headcount_limits(client):
    """Ноль человек и «двести официантов» не принимаются."""
    emp_h, _ = _auth(client, "employer")
    for bad in (0, 21):
        r = client.post("/vacancies", headers=emp_h, json={
            "role": "waiter", "date": local_today(), "start_time": 660,
            "end_time": 1380, "rate": 400, "rate_type": "perHour",
            "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
            "headcount": bad,
        })
        assert r.status_code == 422


def test_old_shifts_default_to_one_person(client):
    """Смены, созданные до появления поля, ведут себя как «нужен один»."""
    emp_h, _ = _auth(client, "employer")
    vac = _vacancy(client, emp_h)          # без headcount в запросе
    assert vac["headcount"] == 1 and vac["slots_left"] == 1
