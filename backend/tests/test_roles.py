"""Должности не должны уходить людям латиницей.

В базе они лежат как `waiter`, а человек читает сообщение в Telegram. Словарь
переводов был скопирован в четыре места, копии разошлись — и в трёх местах
перевода не было вовсе.
"""
from typing import get_args

from app.roles import ROLE_RU, date_ru, role_ru
from app.schemas import StaffRole


def test_every_role_has_russian_name():
    """Словарь обязан покрывать ВЕСЬ список должностей — иначе снова разъедутся."""
    missing = [r for r in get_args(StaffRole) if r not in ROLE_RU]
    assert not missing, f"Нет русского названия: {missing}"


def test_unknown_role_returns_as_is():
    """Старые смены могли создаваться до закрытого списка — не роняем их."""
    assert role_ru("neverseen") == "neverseen"


def test_date_is_human_readable():
    assert date_ru("2026-08-12") == "12.08"
    assert date_ru("") == ""
    assert date_ru("что-то не то") == "что-то не то"


def test_notifications_are_in_russian(client):
    """Дайджест свежих смен: должность и дата — по-русски."""
    from datetime import UTC, datetime, timedelta

    from app.db import SessionLocal
    from app.digest import build_digest
    from app.models import Employer, User, Vacancy

    tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        # Заведение настоящее: смена ссылается на него внешним ключом, и
        # выдуманный идентификатор — положение дел, невозможное в бою.
        emp = Employer(tg_id=90002, phone="tg:90002",
                       company_name="Кофейня", city="Москва")
        db.add(emp)
        db.flush()
        u = User(tg_id=90001, phone="tg:90001", name="Аня", city="Москва")
        db.add(u)
        db.add(Vacancy(
            employer_id=emp.id, role="barista", date=tomorrow,
            start_time=600, end_time=1080, rate=350, city="Москва",
        ))
        db.commit()
        lines = build_digest(db).get(u.id, [])
    finally:
        db.close()

    assert lines, "смена в том же городе должна попасть в дайджест"
    assert "Бариста" in lines[0]
    assert "barista" not in lines[0]
    assert tomorrow not in lines[0]  # дата в виде 2026-08-12 человеку не нужна
