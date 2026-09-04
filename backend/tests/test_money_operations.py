"""Возврат с баланса и сверка платежей — операции, которых не было вовсе.

До этого исправить ошибочное зачисление можно было только прямым доступом к
базе, где движение денег не оставляет следа в журнале. А непришедший вебхук
означал: у ЮKassa деньги есть, у нас их нет, и никто об этом не узнает.
"""
from app.db import SessionLocal
from app.models import Entitlement, Purchase, WalletTxn


def _auth(client, role):
    r = client.post("/auth/telegram",
                    json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id, tg_id):
    from app.models import Employer, User

    db = SessionLocal()
    try:
        o = db.get(User, owner_id) or db.get(Employer, owner_id)
        o.tg_id = tg_id
        if (o.phone or "").startswith("tg:"):
            o.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def _balance(owner_id: str) -> int:
    db = SessionLocal()
    try:
        ent = db.get(Entitlement, owner_id)
        return int(ent.balance_rub) if ent else 0
    finally:
        db.close()


def _setup(client, tg_id=820001):
    emp_h, eid = _auth(client, "employer")
    _detach(eid, tg_id)
    admin_h, _ = _auth(client, "seeker")     # tg_id=0 = оператор в тестах
    return admin_h, eid


def test_operator_can_return_money(client):
    """Ошиблись при зачислении — возврат исправляет и остаётся в журнале."""
    admin_h, eid = _setup(client)
    client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                json={"amount_rub": 5000})
    assert _balance(eid) == 5000

    r = client.post(f"/admin/wallet/{eid}/refund", headers=admin_h,
                    json={"amount_rub": 2000, "note": "ошибка зачисления"})
    assert r.status_code == 200
    assert r.json()["balanceRub"] == 3000
    assert _balance(eid) == 3000

    db = SessionLocal()
    try:
        txns = db.query(WalletTxn).filter(WalletTxn.owner_id == eid).all()
        kinds = sorted(t.kind for t in txns)
        assert kinds == ["refund", "topup"], "возврат обязан быть в журнале"
        assert sum(t.amount for t in txns) == 3000
    finally:
        db.close()


def test_cannot_refund_more_than_balance(client):
    """В минус баланс не уходит."""
    admin_h, eid = _setup(client, 820002)
    client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                json={"amount_rub": 1000})
    r = client.post(f"/admin/wallet/{eid}/refund", headers=admin_h,
                    json={"amount_rub": 5000})
    assert r.status_code == 409
    assert "только 1000" in r.json()["detail"]
    assert _balance(eid) == 1000


def test_refund_requires_admin(client):
    emp_h, eid = _auth(client, "employer")
    _detach(eid, 820003)
    r = client.post(f"/admin/wallet/{eid}/refund", headers=emp_h,
                    json={"amount_rub": 100})
    assert r.status_code in (401, 403)


def test_reconcile_restores_a_lost_payment(client, monkeypatch):
    """Вебхук не дошёл — сверка находит платёж у ЮKassa и дозачисляет."""
    from app import reconcile as rec

    admin_h, eid = _setup(client, 820004)
    assert _balance(eid) == 0

    monkeypatch.setattr(rec.settings, "yookassa_shop_id", "shop", False)
    monkeypatch.setattr(rec.settings, "yookassa_secret_key", "key", False)
    monkeypatch.setattr(rec, "_fetch_payments", lambda *a, **kw: [{
        "id": "потерянный-платёж-1",
        "amount": {"value": "3000.00", "currency": "RUB"},
        "metadata": {"owner_id": eid, "sku": "wallet_topup"},
    }])

    r = client.post("/admin/payments/reconcile", headers=admin_h)
    assert r.status_code == 200, r.text
    assert r.json()["restored"] == 1
    assert r.json()["restored_rub"] == 3000
    assert _balance(eid) == 3000

    # Повторная сверка ничего не дублирует.
    assert client.post("/admin/payments/reconcile",
                       headers=admin_h).json()["restored"] == 0
    assert _balance(eid) == 3000


def test_reconcile_skips_already_processed(client, monkeypatch):
    """Платёж, проведённый вебхуком, сверка не трогает."""
    from app import reconcile as rec

    admin_h, eid = _setup(client, 820005)
    db = SessionLocal()
    try:
        db.add(Purchase(owner_id=eid, sku="wallet_topup", provider="yookassa",
                        amount=1000, currency="RUB", status="paid",
                        provider_charge_id="уже-проведён"))
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(rec.settings, "yookassa_shop_id", "shop", False)
    monkeypatch.setattr(rec.settings, "yookassa_secret_key", "key", False)
    monkeypatch.setattr(rec, "_fetch_payments", lambda *a, **kw: [{
        "id": "уже-проведён",
        "amount": {"value": "1000.00", "currency": "RUB"},
        "metadata": {"owner_id": eid, "sku": "wallet_topup"},
    }])
    r = client.post("/admin/payments/reconcile", headers=admin_h)
    assert r.json()["restored"] == 0
    assert _balance(eid) == 0


def test_reconcile_without_yookassa_is_a_noop(client):
    """Без ключей кассы сверка ничего не делает и не падает."""
    admin_h, _ = _setup(client, 820006)
    r = client.post("/admin/payments/reconcile", headers=admin_h)
    assert r.status_code == 200
    assert "skipped" in r.json()
