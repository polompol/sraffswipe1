"""Супер-лайк «Срочно» должен делать то, что обещан интерфейсом.

В профиле соискателя написано: «Покажут тебя заведению первым». На деле
супер-лайк только списывал баланс и попадал в ленту наравне с обычным
откликом — то есть продавалась фича без эффекта. Это прямо нарушает правило
проекта «не продавать нереализованные».
"""


def _auth(client, role):
    t = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {t['access_token']}"}, t["user_id"]


def _detach(owner_id: str, tg_id: int) -> None:
    """Развести участников по tg_id: insecure-вход в тестах даёт всем 0."""
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


def _vacancy(client, headers):
    from app.timeutil import local_today

    return client.post("/vacancies", headers=headers, json={
        "role": "waiter", "date": local_today(), "start_time": 660,
        "end_time": 1380, "rate": 400, "rate_type": "perHour",
        "lat": 55.75, "lng": 37.61, "address": "Никольская, 10",
    }).json()


def _seeker_with_rating(client, tg_id: int, name: str, rating: float):
    """Соискатель с заданным рейтингом — чтобы проверить, что «Срочно»
    поднимает выше даже того, у кого рейтинг лучше."""
    from app.db import SessionLocal
    from app.models import User

    h, uid = _auth(client, "seeker")
    client.put("/me", headers=h, json={"name": name, "birth_date": "1995-01-01",
                                       "city": "Москва"})
    db = SessionLocal()
    try:
        u = db.get(User, uid)
        u.rating = rating
        db.commit()
    finally:
        db.close()
    _detach(uid, tg_id)
    return h, uid


def test_urgent_candidate_goes_first(client):
    """Отправивший «Срочно» стоит выше кандидата с лучшим рейтингом."""
    emp_h, emp_id = _auth(client, "employer")
    vac = _vacancy(client, emp_h)
    _detach(emp_id, 800001)

    # Сильный кандидат: рейтинг 5.0, обычный отклик.
    strong_h, strong_id = _seeker_with_rating(client, 800002, "Сильный", 5.0)
    client.post("/swipes", headers=strong_h, json={
        "target_id": vac["id"], "target_type": "vacancy", "direction": "like"})

    # Скромный кандидат: рейтинг 3.0, но «Срочно».
    urgent_h, urgent_id = _seeker_with_rating(client, 800003, "Срочный", 3.0)
    r = client.post("/swipes", headers=urgent_h, json={
        "target_id": vac["id"], "target_type": "vacancy",
        "direction": "superlike"})
    assert r.status_code == 200, r.text

    feed = client.get("/candidates", headers=emp_h).json()
    ids = [c["id"] for c in feed]
    assert urgent_id in ids and strong_id in ids
    assert ids.index(urgent_id) < ids.index(strong_id), (
        "«Срочно» не поднял анкету наверх — фича обещана, но не работает"
    )


def test_urgent_to_someone_else_does_not_affect_my_feed(client):
    """«Срочно» действует на то заведение, которому его отправили, а не на все."""
    other_h, other_id = _auth(client, "employer")
    other_vac = _vacancy(client, other_h)
    _detach(other_id, 800010)

    emp_h, emp_id = _auth(client, "employer")
    _vacancy(client, emp_h)
    _detach(emp_id, 800011)

    strong_h, strong_id = _seeker_with_rating(client, 800012, "Сильный", 5.0)
    urgent_h, urgent_id = _seeker_with_rating(client, 800013, "Срочный", 3.0)
    client.post("/swipes", headers=urgent_h, json={
        "target_id": other_vac["id"], "target_type": "vacancy",
        "direction": "superlike"})

    feed = client.get("/candidates", headers=emp_h).json()
    ids = [c["id"] for c in feed]
    # Для ЭТОГО заведения порядок обычный: выше тот, у кого рейтинг лучше.
    assert ids.index(strong_id) < ids.index(urgent_id)


def test_urgent_costs_a_balance_point(client):
    """Баланс «Срочно» тратится, и повторно без остатка не отправить."""
    emp_h, emp_id = _auth(client, "employer")
    v1 = _vacancy(client, emp_h)
    v2 = _vacancy(client, emp_h)
    _detach(emp_id, 800020)

    h, _ = _seeker_with_rating(client, 800021, "Один", 4.0)
    assert client.post("/swipes", headers=h, json={
        "target_id": v1["id"], "target_type": "vacancy",
        "direction": "superlike"}).status_code == 200
    # По умолчанию супер-лайк один — второй должен упереться в баланс.
    r = client.post("/swipes", headers=h, json={
        "target_id": v2["id"], "target_type": "vacancy",
        "direction": "superlike"})
    assert r.status_code == 402
