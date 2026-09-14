"""Pending bank refunds must be resolvable without double-reserving money."""
from uuid import uuid4

from app.db import SessionLocal
from app.financial_models import PaymentRefund, RefundAllowance
from app.models import Entitlement, Purchase


def _auth(client, role):
    r = client.post("/auth/telegram", json={"init_data": "", "role": role}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}, r["user_id"]


def _detach(owner_id: str, tg_id: int) -> None:
    from app.models import Employer, User

    db = SessionLocal()
    try:
        owner = db.get(User, owner_id) or db.get(Employer, owner_id)
        owner.tg_id = tg_id
        if (owner.phone or "").startswith("tg:"):
            owner.phone = f"tg:{tg_id}"
        db.commit()
    finally:
        db.close()


def test_reconcile_retries_pending_refund_with_same_request_id(client, monkeypatch):
    from app import financial_hardening as fh
    from app import reconcile as rec

    employer_h, eid = _auth(client, "employer")
    _detach(eid, 830101)
    admin_h, _ = _auth(client, "seeker")

    client.post(
        f"/admin/wallet/{eid}/credit",
        headers=admin_h,
        json={"amount_rub": 5000, "note": "fixture"},
    )
    db = SessionLocal()
    try:
        purchase = Purchase(
            owner_id=eid,
            sku="wallet_topup",
            provider="yookassa",
            amount=5000,
            currency="RUB",
            status="paid",
            provider_charge_id="charge-pending-reconcile",
        )
        db.add(purchase)
        db.commit()
        db.refresh(purchase)
        purchase_id = purchase.id
    finally:
        db.close()

    calls: list[tuple[str, int, str]] = []

    def unknown(charge_id: str, amount: int, request_id: str):
        calls.append((charge_id, amount, request_id))
        return "unknown", None

    monkeypatch.setattr(fh, "_create_yookassa_refund", unknown)
    request_id = str(uuid4())
    r = client.post(
        f"/admin/payments/{purchase_id}/refund",
        headers=admin_h,
        json={"request_id": request_id, "amount_rub": 2000, "note": "timeout"},
    )
    assert r.status_code == 202, r.text

    monkeypatch.setattr(rec.settings, "yookassa_shop_id", "shop", False)
    monkeypatch.setattr(rec.settings, "yookassa_secret_key", "key", False)
    monkeypatch.setattr(rec, "_fetch_payments", lambda *a, **kw: [])

    def succeeds(charge_id: str, amount: int, retry_id: str):
        calls.append((charge_id, amount, retry_id))
        return "succeeded", "refund-reconciled-1"

    monkeypatch.setattr(fh, "_create_yookassa_refund", succeeds)
    out = client.post("/admin/payments/reconcile", headers=admin_h)
    assert out.status_code == 200, out.text
    body = out.json()
    assert body["refunds_checked"] == 1
    assert body["refunds_succeeded"] == 1
    assert len(calls) == 2
    assert calls[0][2] == request_id == calls[1][2]

    db = SessionLocal()
    try:
        refund = db.query(PaymentRefund).filter(
            PaymentRefund.request_id == request_id
        ).one()
        allowance = db.get(RefundAllowance, purchase_id)
        ent = db.get(Entitlement, eid)
        assert refund.status == "succeeded"
        assert refund.provider_refund_id == "refund-reconciled-1"
        assert allowance.reserved_amount == 2000
        assert ent.balance_rub == 3000
    finally:
        db.close()
