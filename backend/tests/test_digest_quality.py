"""Что попадает в рассылку «свежие смены рядом».

Рассылка — единственное, что возвращает людей в приложение. Каждая мёртвая
строка в ней стоит доверия: человек открывает приложение, ищет смену из
письма и не находит ничего.
"""
from datetime import UTC, date, datetime, timedelta

from app.db import SessionLocal
from app.digest import build_digest
from app.models import Employer, Swipe, User, Vacancy
from app.timeutil import local_today


def _shift(employer_id: str, day: str, role: str = "barista") -> Vacancy:
    return Vacancy(
        employer_id=employer_id, role=role, date=day, start_time=600,
        end_time=1080, rate=350, city="Москва", status="active",
    )


def test_a_past_shift_is_not_advertised(client):
    """Вчерашняя смена в ленте не показывается — и в письме не должна."""
    yesterday = (date.fromisoformat(local_today()) - timedelta(days=1)).isoformat()
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        u = User(tg_id=980001, phone="tg:980001", name="Аня", city="Москва")
        db.add(u)
        db.add(Employer(id="emp-live", tg_id=980002, phone="tg:980002",
                        company_name="Кофейня"))
        db.add(_shift("emp-live", yesterday, "cook"))
        db.add(_shift("emp-live", tomorrow, "barista"))
        db.commit()
        lines = build_digest(db).get(u.id, [])
    finally:
        db.close()
    assert len(lines) == 1
    assert "Бариста" in lines[0]


def test_a_blocked_venue_is_not_advertised(client):
    """Заведение забанено — звать людей на его смены нельзя."""
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        u = User(tg_id=980010, phone="tg:980010", name="Аня", city="Москва")
        db.add(u)
        db.add(Employer(id="emp-bad", tg_id=980011, phone="tg:980011",
                        company_name="Плохое", blocked=True))
        db.add(_shift("emp-bad", tomorrow))
        db.commit()
        assert build_digest(db).get(u.id, []) == []
    finally:
        db.close()


def test_an_already_swiped_shift_is_not_repeated(client):
    """Смену, которую человек уже посмотрел, второй раз не предлагаем."""
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        u = User(tg_id=980020, phone="tg:980020", name="Аня", city="Москва")
        db.add(u)
        db.add(Employer(id="emp-ok", tg_id=980021, phone="tg:980021",
                        company_name="Кофейня"))
        v = _shift("emp-ok", tomorrow)
        db.add(v)
        db.commit()
        db.add(Swipe(swiper_id=u.id, target_id=v.id, target_type="vacancy",
                     direction="pass"))
        db.commit()
        assert build_digest(db).get(u.id, []) == []
    finally:
        db.close()


def test_a_shift_from_another_city_is_not_offered(client):
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        u = User(tg_id=980030, phone="tg:980030", name="Ильдар", city="Казань")
        db.add(u)
        db.add(Employer(id="emp-msk", tg_id=980031, phone="tg:980031",
                        company_name="Московская"))
        db.add(_shift("emp-msk", tomorrow))
        db.commit()
        assert build_digest(db).get(u.id, []) == []
    finally:
        db.close()
