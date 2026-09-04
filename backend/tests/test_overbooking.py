"""Двойное бронирование: два человека на одно место.

Свободные места при создании мэтча не проверялись ВООБЩЕ. Смена уходила из
ленты, когда место занимали, — но откликнуться до этого успевали двое, и
заведение, лайкнув обоих, получало два мэтча на одно место. Оба уверены, что
смена их: один приезжает зря, а комиссия начисляется за каждого закрытого.
"""
from app.db import SessionLocal
from app.models import Employer, Match, User
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


def _vacancy(client, headers, headcount=1):
    return client.post("/vacancies", headers=headers, json={
        "role": "waiter", "date": local_today(), "start_time": 660,
        "end_time": 1380, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
        "headcount": headcount,
    }).json()


def _seeker_likes(client, vac_id, tg_id):
    """Соискатель откликается на смену. Возвращает его id."""
    h, uid = _auth(client, "seeker")
    client.post("/swipes", headers=h, json={
        "target_id": vac_id, "target_type": "vacancy", "direction": "like"})
    _detach(uid, tg_id)
    return h, uid


def _matches_on(vac_id: str) -> int:
    db = SessionLocal()
    try:
        return db.query(Match).filter(Match.vacancy_id == vac_id).count()
    finally:
        db.close()


def test_employer_cannot_take_two_people_for_one_place(client):
    """Главный сценарий: на смену для одного откликнулись двое."""
    emp_h, eid = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=1)
    _detach(eid, 830001)

    _, first = _seeker_likes(client, vac["id"], 830002)
    _, second = _seeker_likes(client, vac["id"], 830003)

    r1 = client.post("/swipes", headers=emp_h, json={
        "target_id": first, "target_type": "user", "direction": "like"})
    assert r1.json()["matched"] is True

    r2 = client.post("/swipes", headers=emp_h, json={
        "target_id": second, "target_type": "user", "direction": "like"})
    assert r2.status_code == 409, "второй человек занял бы то же самое место"
    assert "набраны все" in r2.json()["detail"]
    assert _matches_on(vac["id"]) == 1


def test_seeker_cannot_take_a_place_that_is_already_gone(client):
    """Обратный порядок: заведение позвало двоих, места кончились, пока
    второй думал. Его отклик записывается, но мэтча не возникает."""
    emp_h, eid = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=1)
    _detach(eid, 830010)

    # Заведение зовёт двоих заранее.
    h1, u1 = _auth(client, "seeker")
    _detach(u1, 830011)
    h2, u2 = _auth(client, "seeker")
    _detach(u2, 830012)
    for uid in (u1, u2):
        client.post("/swipes", headers=emp_h, json={
            "target_id": uid, "target_type": "user", "direction": "like"})

    r1 = client.post("/swipes", headers=h1, json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like"})
    assert r1.json()["matched"] is True

    r2 = client.post("/swipes", headers=h2, json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like"})
    assert r2.status_code == 200
    assert r2.json()["matched"] is False, "мест не осталось — мэтча быть не должно"
    assert r2.json()["recorded"] is True, "отклик записан: человек не виноват"
    assert _matches_on(vac["id"]) == 1


def test_three_places_take_three_and_refuse_the_fourth(client):
    """Смена на троих: трое проходят, четвёртый — нет."""
    emp_h, eid = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=3)
    _detach(eid, 830020)

    ids = [_seeker_likes(client, vac["id"], 830021 + i)[1] for i in range(4)]
    results = [
        client.post("/swipes", headers=emp_h, json={
            "target_id": uid, "target_type": "user", "direction": "like"})
        for uid in ids
    ]
    assert [r.status_code for r in results] == [200, 200, 200, 409]
    assert _matches_on(vac["id"]) == 3


def test_no_show_frees_the_place_for_someone_else(client):
    """Неявка освобождает место: заведение может позвать другого."""
    emp_h, eid = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=1)
    _detach(eid, 830030)

    _, first = _seeker_likes(client, vac["id"], 830031)
    _, second = _seeker_likes(client, vac["id"], 830032)
    r1 = client.post("/swipes", headers=emp_h, json={
        "target_id": first, "target_type": "user", "direction": "like"}).json()

    db = SessionLocal()
    try:
        m = db.get(Match, r1["match_id"])
        m.no_show = True
        db.commit()
    finally:
        db.close()

    r2 = client.post("/swipes", headers=emp_h, json={
        "target_id": second, "target_type": "user", "direction": "like"})
    assert r2.status_code == 200 and r2.json()["matched"] is True


def test_repeated_like_does_not_consume_a_second_place(client):
    """Повторный лайк того же человека не съедает ещё одно место."""
    emp_h, eid = _auth(client, "employer")
    vac = _vacancy(client, emp_h, headcount=1)
    _detach(eid, 830040)
    _, uid = _seeker_likes(client, vac["id"], 830041)

    first = client.post("/swipes", headers=emp_h, json={
        "target_id": uid, "target_type": "user", "direction": "like"})
    again = client.post("/swipes", headers=emp_h, json={
        "target_id": uid, "target_type": "user", "direction": "like"})
    assert first.json()["matched"] is True
    assert again.status_code == 200 and again.json()["matched"] is True
    assert _matches_on(vac["id"]) == 1
