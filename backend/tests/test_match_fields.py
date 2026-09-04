"""Мэтч должен знать, С КЕМ и НА ЧТО договорились.

Приложение рисует в «Моих сменах» название заведения и должность, а у
работодателя — имя человека. Все три поля приходили только из демо-данных:
на разработческой сборке экран выглядел правильно, а на живом сервере каждая
строка превращалась в безымянное «Заведение» без должности.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Employer, User


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


def _name(owner_id, **fields):
    """Проставить анкете имя/название — их insecure-логин не заполняет."""
    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        for k, v in fields.items():
            setattr(o, k, v)
        db.commit()
    finally:
        db.close()


def _matched(client, role="barista", tg=930000):
    """Довести пару до мэтча и вернуть заголовки обеих сторон."""
    emp_h, eid = _auth(client, "employer")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    v = client.post("/vacancies", headers=emp_h, json={
        "role": role, "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61,
    }).json()
    _detach(eid, tg)
    _name(eid, company_name="Кофейня «Дрова»", photo_url="https://ex.test/logo.jpg")

    see_h, sid = _auth(client, "seeker")
    _detach(sid, tg + 1)
    _name(sid, name="Мария")

    client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]})
    return emp_h, see_h, v


def test_seeker_sees_the_venue_and_the_job(client):
    _, see_h, v = _matched(client, tg=930100)
    m = client.get("/matches", headers=see_h).json()[0]
    assert m["company_name"] == "Кофейня «Дрова»"
    assert m["role"] == "barista"
    assert m["company_photo_url"] == "https://ex.test/logo.jpg"
    assert m["vacancy_id"] == v["id"]


def test_employer_sees_the_persons_name(client):
    emp_h, _, _ = _matched(client, tg=930200)
    m = client.get("/matches", headers=emp_h).json()[0]
    assert m["seeker_name"] == "Мария"
    assert m["role"] == "barista"


def test_a_single_match_carries_the_same_fields(client):
    """Одиночный ответ (после отметки прихода и т.п.) — не беднее списка."""
    emp_h, see_h, _ = _matched(client, role="waiter", tg=930300)
    mid = client.get("/matches", headers=see_h).json()[0]["id"]
    one = client.post(f"/matches/{mid}/confirm", headers=see_h).json()
    assert one["company_name"] == "Кофейня «Дрова»"
    assert one["role"] == "waiter"


def test_venue_without_a_logo_falls_back_to_the_interior_photo(client):
    """Логотипа нет — берём снимок интерьера смены, а не пустоту."""
    emp_h, eid = _auth(client, "employer")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    v = client.post("/vacancies", headers=emp_h, json={
        "role": "cook", "date": day, "start_time": 600, "end_time": 1080,
        "rate": 400, "rate_type": "perHour", "city": "Москва",
        "lat": 55.75, "lng": 37.61,
        "interior_photo_url": "https://ex.test/zal.jpg",
    }).json()
    _detach(eid, 930400)
    _name(eid, company_name="Бар «Полночь»", photo_url="")

    see_h, sid = _auth(client, "seeker")
    _detach(sid, 930401)
    client.post("/swipes", headers=see_h, json={
        "target_id": v["id"], "target_type": "vacancy", "direction": "like"})
    client.post("/swipes", headers=emp_h, json={
        "target_id": sid, "target_type": "user", "direction": "like",
        "vacancy_id": v["id"]})

    m = client.get("/matches", headers=see_h).json()[0]
    assert m["company_photo_url"] == "https://ex.test/zal.jpg"


def test_the_list_does_not_query_per_row(client):
    """Пять мэтчей — столько же запросов, сколько один: поля не по строке."""
    emp_h, eid = _auth(client, "employer")
    _detach(eid, 930500)
    _name(eid, company_name="Ресторан «Грядка»")
    day = (datetime.now(UTC) + timedelta(days=2)).date().isoformat()
    for i in range(5):
        v = client.post("/vacancies", headers=emp_h, json={
            "role": "waiter", "date": day, "start_time": 600, "end_time": 1080,
            "rate": 400, "rate_type": "perHour", "city": "Москва",
            "lat": 55.75, "lng": 37.61,
        }).json()
        see_h, sid = _auth(client, "seeker")
        _detach(sid, 930510 + i)
        _name(sid, name=f"Работник {i}")
        client.post("/swipes", headers=see_h, json={
            "target_id": v["id"], "target_type": "vacancy",
            "direction": "like"})
        client.post("/swipes", headers=emp_h, json={
            "target_id": sid, "target_type": "user", "direction": "like",
            "vacancy_id": v["id"]})

    rows = client.get("/matches", headers=emp_h).json()
    assert len(rows) == 5
    assert {r["seeker_name"] for r in rows} == {f"Работник {i}" for i in range(5)}
    assert all(r["company_name"] == "Ресторан «Грядка»" for r in rows)
