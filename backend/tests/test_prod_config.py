"""Прод-конфиг: настройки денег обязаны доходить до приложения.

Эти строки живут в docker-compose.prod.yml, а не в коде, и ошибка в них не
видна ничем: приложение поднимается, /health отвечает «ok», и только оплата
тихо не работает. Ровно так и было — ЮKassa заполнялась в .env, а до
контейнера API не доходила: кнопка «Оплатить картой» отвечала «оплата картой
скоро», а вебхук об успешном платеже отвергался с чужим секретом.

Тест дешёвый и ловит целый класс молчаливых потерь денег.
"""
import re
from pathlib import Path

COMPOSE = Path(__file__).resolve().parents[2] / "docker-compose.prod.yml"

# Без чего деньги не дойдут до баланса заведения.
MONEY_VARS = [
    "YOOKASSA_SHOP_ID",
    "YOOKASSA_SECRET_KEY",
    "YOOKASSA_WEBHOOK_SECRET",
    "PAYMENT_RETURN_URL",
    "COMMISSION_PCT",
]

# Без чего ресторан-юрлицо не оплатит комиссию по безналу.
INVOICE_VARS = [
    "ORG_NAME", "ORG_INN", "ORG_BANK_ACCOUNT", "ORG_BANK_BIC",
]


def _service_block(name: str) -> str:
    """Кусок compose-файла, относящийся к одному сервису."""
    text = COMPOSE.read_text(encoding="utf-8")
    start = text.index(f"\n  {name}:\n")
    rest = text[start + 1:]
    # Следующий сервис — строка вида «  имя:» на том же отступе.
    nxt = re.search(r"\n  [a-z][\w-]*:\n", rest)
    return rest[: nxt.start()] if nxt else rest


def test_api_gets_money_settings():
    block = _service_block("api")
    missing = [v for v in MONEY_VARS + INVOICE_VARS if f"{v}:" not in block]
    assert not missing, f"API не получит настройки денег: {missing}"


def test_scheduler_counts_commission_the_same_way():
    """Авто-закрытие смен начисляет комиссию — процент должен совпадать с API."""
    block = _service_block("scheduler")
    for var in ("COMMISSION_PCT", "COMMISSION_MIN_RUB", "YOOKASSA_SHOP_ID"):
        assert f"{var}:" in block, var


def test_env_example_documents_money_vars():
    """Владелец не разработчик: то, что нужно заполнить, должно быть в шаблоне."""
    example = (COMPOSE.parent / ".env.example").read_text(encoding="utf-8")
    missing = [v for v in MONEY_VARS if f"{v}=" not in example]
    assert not missing, f"Нет в .env.example: {missing}"
