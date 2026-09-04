"""Сверка платежей: что оператор видит, когда ЮKassa недоступна.

Сверка ходит к ЮKassa по сети, и сеть падает: таймаут, чужой прокси, отказ
DNS, 500 на той стороне. Падение сверки — нормальная ситуация, крон от него
не должен умирать, а оператор должен понимать, что данные не пришли.

А вот текст самого исключения оператору не показываем. Дыры тут нет —
эндпоинт админский, — но текст ошибки составляет библиотека, и что в него
попадёт, мы не выбираем. Оператору он ничего не объясняет, а разбираться
надо по логу, куда исключение уходит целиком.
"""
import logging

import pytest

from app import reconcile as rec
from app.config import settings
from app.db import SessionLocal


@pytest.fixture()
def db(client):  # client поднимает и чистит базу
    """Сессия к базе — сверка работает с ней напрямую, без HTTP."""
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def yookassa_on():
    """Включить ЮKassa на время теста: без ключей сверка выходит сразу."""
    shop, key = settings.yookassa_shop_id, settings.yookassa_secret_key
    settings.yookassa_shop_id, settings.yookassa_secret_key = "test-shop", "test-key"
    try:
        yield
    finally:
        settings.yookassa_shop_id, settings.yookassa_secret_key = shop, key


def test_reconcile_hides_exception_text(db, monkeypatch, yookassa_on, caplog):
    """Наружу — короткое сообщение, подробности — в лог."""
    secret_ish = "https://api.yookassa.ru/v3/payments Authorization: Basic dGVzdA=="

    def boom(*_a, **_kw):
        raise RuntimeError(secret_ish)

    monkeypatch.setattr(rec, "_fetch_payments", boom)

    with caplog.at_level(logging.ERROR, logger="staffswipe"):
        out = rec.reconcile(db, hours=1)

    # Оператор видит, что сверка не прошла, — и ничего сверх этого.
    assert out == {"error": "Не удалось получить платежи ЮKassa"}
    assert secret_ish not in str(out)

    # А в логе — целиком, вместе со стеком: иначе чинить нечем.
    assert secret_ish in caplog.text
    assert "Traceback" in caplog.text


def test_reconcile_without_yookassa_says_so(db):
    """Без ключей сверка не выдумывает ошибку, а честно говорит, что не подключена."""
    out = rec.reconcile(db, hours=1)
    assert out == {"skipped": "ЮKassa не подключена"}
