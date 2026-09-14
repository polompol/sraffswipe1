"""Regression checks for SQLite legacy transaction boundaries in money flows."""
from uuid import uuid4

from app.db import SessionLocal
from app.financial_models import PaymentRefund, RefundAllowance
from app.models import Purchase


def _auth(client, role: str):
    body = client.post(
        "/auth/telegram", json={"init_data": "", "role": role}
    ).json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user_id"]


def _paid_purchase(owner_id: str) -> str:
    db = SessionLocal()
    try:
        purchase = Purchase(
            owner_id=owner_id,
            sku="wallet_topup",
            provider="yookassa",
            amount=5000,
            currency="RUB",
            status="paid",
            provider_charge_id=f"sqlite-refund-{uuid4()}",
        )
        db.add(purchase)
        db.commit()
        db.refresh(purchase)
        return purchase.id
    finally:
        db.close()


def test_failed_refund_reservation_does_not_leave_phantom_request(client, monkeypatch):
    """A 409 before provider I/O must fully release the request-id claim.

    SQLite's legacy transaction mode does not make a SAVEPOINT an outer
    transaction.  If the request-id claim survives ``rollback()``, retrying the
    same UUID later returns a fake pending refund even though no balance was
    reserved and YooKassa was never called.
    """
    from app import financial_hardening as fh

    _, employer_id = _auth(client, "employer")
    admin_h, _ = _auth(client, "seeker")
    purchase_id = _paid_purchase(employer_id)

    client.post(
        f"/admin/wallet/{employer_id}/credit",
        headers=admin_h,
        json={"amount_rub": 1000, "note": "too little"},
    )
    request_id = str(uuid4())
    payload = {
        "request_id": request_id,
        "amount_rub": 2000,
        "note": "retry after funding",
    }

    provider_calls: list[tuple] = []

    def provider(*args):
        provider_calls.append(args)
        return "succeeded", "refund-after-retry"

    monkeypatch.setattr(fh, "_create_yookassa_refund", provider)
    first = client.post(
        f"/admin/payments/{purchase_id}/refund",
        headers=admin_h,
        json=payload,
    )
    assert first.status_code == 409, first.text
    assert provider_calls == []

    db = SessionLocal()
    try:
        assert db.query(PaymentRefund).filter(
            PaymentRefund.request_id == request_id
        ).count() == 0
        allowance = db.get(RefundAllowance, purchase_id)
        assert allowance is None or allowance.reserved_amount == 0
    finally:
        db.close()

    client.post(
        f"/admin/wallet/{employer_id}/credit",
        headers=admin_h,
        json={"amount_rub": 2000, "note": "fund retry"},
    )
    second = client.post(
        f"/admin/payments/{purchase_id}/refund",
        headers=admin_h,
        json=payload,
    )
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "succeeded"
    assert len(provider_calls) == 1

    db = SessionLocal()
    try:
        refund = db.query(PaymentRefund).filter(
            PaymentRefund.request_id == request_id
        ).one()
        assert refund.status == "succeeded"
        assert refund.provider_refund_id == "refund-after-retry"
    finally:
        db.close()
