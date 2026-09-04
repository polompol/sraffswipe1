"""Пополнение баланса: платёж и зачисление — одна транзакция.

Самая дорогая из найденных ошибок. Было так: запись «оплачено» добавлялась в
сессию, потом вызывалось зачисление, а внутри него создание строки прав
делало КОММИТ — и фиксировало заодно висящую запись о платеже. Между этим
коммитом и зачислением денег оставалось окно.

Сбой в этом окне (перезапуск контейнера, обрыв соединения) давал:
  - у ЮKassa деньги списаны;
  - в базе платёж помечен «оплачено»;
  - баланс заведения — ноль;
  - повторный вебхук видел дубль по charge_id и молча уходил.
Деньги терялись навсегда, и ни один отчёт этого не показывал.
"""
import pytest

from app.db import SessionLocal
from app.models import Entitlement, Purchase, WalletTxn

SECRET = "test-internal-secret"   # совпадает с conftest


def _employer(client):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": "employer"}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _webhook(client, owner_id, rub, charge_id):
    return client.post(
        f"/billing/yookassa/webhook?secret={SECRET}",
        json={
            "event": "payment.succeeded",
            "object": {
                "id": charge_id,
                "amount": {"value": f"{rub}.00", "currency": "RUB"},
                "metadata": {
                    "owner_id": owner_id, "sku": "wallet_topup",
                    "amount_rub": str(rub),
                },
            },
        },
    )


def _state(owner_id):
    db = SessionLocal()
    try:
        ent = db.get(Entitlement, owner_id)
        return {
            "balance": ent.balance_rub if ent else 0,
            "purchases": db.query(Purchase).filter(
                Purchase.owner_id == owner_id).count(),
            "txns": db.query(WalletTxn).filter(
                WalletTxn.owner_id == owner_id).count(),
        }
    finally:
        db.close()


def test_topup_credits_the_balance(client):
    """Обычный путь: деньги пришли — баланс вырос ровно на сумму."""
    _, eid = _employer(client)
    assert _webhook(client, eid, 3000, "pay-1").status_code == 200
    st = _state(eid)
    assert st == {"balance": 3000, "purchases": 1, "txns": 1}


def test_repeated_webhook_credits_once(client):
    """ЮKassa повторяет доставку — зачисляем один раз."""
    _, eid = _employer(client)
    _webhook(client, eid, 3000, "pay-2")
    r = _webhook(client, eid, 3000, "pay-2")
    assert r.json().get("duplicate") is True
    assert _state(eid)["balance"] == 3000


def test_crash_after_payment_row_leaves_nothing_behind(client, monkeypatch):
    """Сбой посреди зачисления не должен оставлять «оплачено» без денег.

    Ломаем зачисление ровно там, где раньше проходила граница коммита. После
    сбоя в базе не должно остаться НИЧЕГО: ни записи о платеже, ни движения.
    Иначе повтор вебхука посчитает платёж дублем и деньги пропадут.
    """
    from app.routers import billing

    _, eid = _employer(client)

    def explode(*a, **kw):
        raise RuntimeError("контейнер перезапустился посреди зачисления")

    monkeypatch.setattr(billing, "credit_wallet", explode)
    with pytest.raises(RuntimeError):
        _webhook(client, eid, 5000, "pay-3")

    st = _state(eid)
    assert st["purchases"] == 0, (
        "платёж остался помеченным оплаченным без зачисления — "
        "повтор вебхука сочтёт его дублем, и деньги пропадут"
    )
    assert st["balance"] == 0 and st["txns"] == 0


def test_retry_after_crash_credits_the_money(client, monkeypatch):
    """Главная проверка: после сбоя повторный вебхук доводит деньги до баланса."""
    from app.routers import billing

    _, eid = _employer(client)
    real = billing.credit_wallet

    def explode(*a, **kw):
        raise RuntimeError("сбой")

    monkeypatch.setattr(billing, "credit_wallet", explode)
    with pytest.raises(RuntimeError):
        _webhook(client, eid, 5000, "pay-4")

    monkeypatch.setattr(billing, "credit_wallet", real)
    assert _webhook(client, eid, 5000, "pay-4").status_code == 200
    assert _state(eid)["balance"] == 5000


def test_wrong_amount_is_rejected(client):
    """Сумма в платеже обязана совпадать с той, что мы просили."""
    _, eid = _employer(client)
    r = client.post(
        f"/billing/yookassa/webhook?secret={SECRET}",
        json={
            "event": "payment.succeeded",
            "object": {
                "id": "pay-5",
                "amount": {"value": "100000.00", "currency": "RUB"},
                "metadata": {"owner_id": eid, "sku": "wallet_topup",
                             "amount_rub": "1000"},
            },
        },
    )
    assert r.status_code == 400
    assert _state(eid)["balance"] == 0


def test_webhook_requires_secret(client):
    _, eid = _employer(client)
    r = client.post("/billing/yookassa/webhook?secret=неверный", json={
        "event": "payment.succeeded",
        "object": {"id": "pay-6", "amount": {"value": "1000.00",
                                             "currency": "RUB"},
                   "metadata": {"owner_id": eid, "sku": "wallet_topup",
                                "amount_rub": "1000"}},
    })
    assert r.status_code == 401
    assert _state(eid)["balance"] == 0
