"""Лента остаётся лентой «рядом», когда смен становится много.

База отдаёт ограниченную выборку — иначе на больших объёмах запрос начал бы
тянуть в память тысячи строк. Важно, ЧТО именно в эту выборку попадает:
если сначала взять самые свежие смены и уже среди них искать близкие, то
человек с окраины увидит только центр — просто потому, что там публикуют
чаще. Пока смен десятки, это незаметно; на нескольких сотнях лента тихо
перестаёт работать по назначению.
"""
import uuid

from app.db import SessionLocal
from app.models import Employer, Vacancy
from app.timeutil import local_today

# Дом человека — Хамовники.
HOME = (55.734, 37.588)
# «Далеко»: Зеленоград, ~35 км — за пределами радиуса по умолчанию (25 км).
FAR = (56.000, 37.200)


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id, tg_id):
    db = SessionLocal()
    try:
        o = db.get(Employer, owner_id)
        o.tg_id = tg_id
        o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _bulk(employer_id, count, lat, lng, created_at):
    """Пишем смены пачкой мимо API: создание ограничено 20 в минуту."""
    db = SessionLocal()
    try:
        db.bulk_save_objects([
            Vacancy(
                id=str(uuid.uuid4()), employer_id=employer_id, role="waiter",
                date=local_today(), start_time=600, end_time=1080,
                rate=400, rate_type="perHour", lat=lat, lng=lng,
                address="Тестовая", city="Москва", status="active",
                created_at=created_at,
            )
            for _ in range(count)
        ])
        db.commit()
    finally:
        db.close()


def test_near_shift_survives_a_crowd_of_fresh_far_ones(client):
    """Одна смена рядом не должна теряться среди сотен свежих, но далёких."""
    from datetime import UTC, datetime, timedelta

    emp_h, eid = _auth(client, "employer")
    _detach(eid, 940001)
    old = datetime.now(UTC) - timedelta(days=1)
    # Смена рядом — старая: при выборке «самые свежие» она выпадет первой.
    _bulk(eid, 1, HOME[0], HOME[1], old)
    # И 400 свежих, но далёких.
    _bulk(eid, 400, FAR[0], FAR[1], datetime.now(UTC))

    rows = client.get("/vacancies", params={
        "lat": HOME[0], "lng": HOME[1], "radius_km": 25,
    }).json()
    assert len(rows) == 1, "далёкие смены не должны попадать в ленту"
    assert rows[0]["distance_km"] is not None
    assert rows[0]["distance_km"] < 1


def test_city_only_shifts_are_not_dropped(client):
    """Смена без точки на карте (заведена только по городу) остаётся видимой.

    Её нельзя судить по расстоянию: координат нет. Если бы рамка выбрасывала
    и такие, заведение опубликовало бы смену и не поняло, почему её не видно.
    """
    from datetime import UTC, datetime

    emp_h, eid = _auth(client, "employer")
    _detach(eid, 940010)
    _bulk(eid, 1, 0.0, 0.0, datetime.now(UTC))

    rows = client.get("/vacancies", params={
        "lat": HOME[0], "lng": HOME[1], "radius_km": 5,
    }).json()
    assert len(rows) == 1
    assert rows[0]["distance_km"] is None


def test_feed_without_coordinates_still_works(client):
    """Без геолокации лента показывает всё подряд — рамка не применяется."""
    from datetime import UTC, datetime

    emp_h, eid = _auth(client, "employer")
    _detach(eid, 940020)
    _bulk(eid, 3, FAR[0], FAR[1], datetime.now(UTC))

    rows = client.get("/vacancies").json()
    assert len(rows) >= 3
