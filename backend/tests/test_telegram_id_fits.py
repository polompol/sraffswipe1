"""Telegram-идентификатор обязан помещаться в колонку.

Телеграм в документации к Bot API прямо предупреждает про поле User.id:
«This number may have more than 32 significant bits… it has at most 52
significant bits, so a 64-bit integer or double-precision float type are safe
for storing this identifier».

tg_id был объявлен как sa.Integer. В PostgreSQL это INTEGER — четыре байта,
потолок 2 147 483 647. У человека с идентификатором больше этого числа
регистрация падала на вставке, и сделать он с этим ничего не мог: свой
telegram-id не выбирают.

Почему не заметили: тесты по умолчанию идут на SQLite, а SQLite объявленную
ширину целого не соблюдает и молча хранит восемь байт. Дефект был виден
только на PostgreSQL — то есть только в бою.
"""
import pytest
from sqlalchemy.exc import DataError, OperationalError

from app.db import SessionLocal
from app.models import Employer, User

# Заведомо больше потолка INTEGER (2 147 483 647), но в пределах 52 бит,
# которые обещает Telegram.
BIG_TG_ID = 7_654_321_098


@pytest.mark.parametrize("model,extra", [
    (User, {"phone": "tg:7654321098"}),
    (Employer, {"phone": "tg:7654321099"}),
])
def test_big_telegram_id_is_storable(client, model, extra):
    """Человек с большим telegram-id обязан заводиться в обеих таблицах.

    Фикстура `client` здесь не ради запросов, а ради схемы: на SQLite таблицы
    создаёт именно она. Без неё тест падал с «no such table: users» — то есть
    проверял бы не ширину колонки, а собственную неготовность.
    """
    tg = BIG_TG_ID + (0 if model is User else 1)
    db = SessionLocal()
    try:
        row = model(tg_id=tg, **extra)
        db.add(row)
        try:
            db.commit()
        except (DataError, OperationalError) as exc:
            db.rollback()
            pytest.fail(
                f"{model.__tablename__}.tg_id не вмещает настоящий "
                f"telegram-id: {exc.__class__.__name__}: {exc}"
            )
        assert db.get(model, row.id).tg_id == tg, "значение сохранилось искажённым"
    finally:
        db.close()
