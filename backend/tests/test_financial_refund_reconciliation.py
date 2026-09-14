"""Pending bank refunds must be resolvable without double-reserving money."""
from datetime import datetime, timedelta
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


def _paid_purchase(eid: str, charge_id: str) -> str:
    db = SessionLocal()
    try:
        purchase = Purchase(
            owner_id=eid,
            sku="wallet_topup",
            provider="yookassa",
            amount=5000,
            currency="RUB",
            status="paid",
            provider_charge_id=charge_id,
        )
        db.add(purchase)
        db.commit()
        db.refresh(purchase)
        return purchase.id
    finally:
        db.close()


def _prepare_reconcile(rec, monkeypatch) -> None:
    monkeypatch.setattr(rec.settings, "yookassa_shop_id", "shop", False)
    monkeypatch.setattr(rec.settings, "yookassa_secret_key", "key", False)
    monkeypatch.setattr(rec, "_fetch_payments", lambda *a, **kw: [])


def test_reconcile_retries_pending_refund_with_same_request_id(client, monkeypatch):
    from app import financial_hardening as fh
    from app import reconcile as rec

    _, eid = _auth(client, "employer")
    _detach(eid, 830101)
    admin_h, _ = _auth(client, "seeker")

    client.post(
        f"/admin/wallet/{eid}/credit",
        headers=admin_h,
        json={"amount_rub": 5000, "note": "fixture"},
    )
    purchase_id = _paid_purchase(eid, "charge-pending-reconcile")

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

    _prepare_reconcile(rec, monkeypatch)

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


def test_reconcile_keeps_unknown_refund_pending_and_reserved(client, monkeypatch):
    from app import financial_hardening as fh
    from app import reconcile as rec

    _, eid = _auth(client, "employer")
    _detach(eid, 830102)
    admin_h, _ = _auth(client, "seeker")
    client.post(
        f"/admin/wallet/{eid}/credit",
        headers=admin_h,
        json={"amount_rub": 5000, "note": "fixture"},
    )
    purchase_id = _paid_purchase(eid, "charge-pending-still-unknown")
    request_id = str(uuid4())

    monkeypatch.setattr(
        fh,
        "_create_yookassa_refund",
        lambda *args: ("unknown", None),
    )
    first = client.post(
        f"/admin/payments/{purchase_id}/refund",
        headers=admin_h,
        json={"request_id": request_id, "amount_rub": 1500, "note": "timeout"},
    )
    assert first.status_code == 202, first.text

    _prepare_reconcile(rec, monkeypatch)
    calls: list[tuple[str, int, str]] = []

    def still_unknown(charge_id: str, amount: int, retry_id: str):
        calls.append((charge_id, amount, retry_id))
        return "unknown", "refund-pending-provider-1"

    monkeypatch.setattr(fh, "_create_yookassa_refund", still_unknown)
    out = client.post("/admin/payments/reconcile", headers=admin_h)
    assert out.status_code == 200, out.text
    body = out.json()
    assert body["refunds_checked"] == 1
    assert body["refunds_pending"] == 1
    assert calls == [("charge-pending-still-unknown", 1500, request_id)]

    db = SessionLocal()
    try:
        refund = db.query(PaymentRefund).filter(
            PaymentRefund.request_id == request_id
        ).one()
        allowance = db.get(RefundAllowance, purchase_id)
        ent = db.get(Entitlement, eid)
        assert refund.status == "pending"
        assert refund.provider_refund_id == "refund-pending-provider-1"
        assert allowance.reserved_amount == 1500
        assert ent.balance_rub == 3500
    finally:
        db.close()


def test_reconcile_definitive_rejection_releases_reservation_once(client, monkeypatch):
    from app import financial_hardening as fh
    from app import reconcile as rec

    _, eid = _auth(client, "employer")
    _detach(eid, 830103)
    admin_h, _ = _auth(client, "seeker")
    client.post(
        f"/admin/wallet/{eid}/credit",
        headers=admin_h,
        json={"amount_rub": 5000, "note": "fixture"},
    )
    purchase_id = _paid_purchase(eid, "charge-pending-rejected")
    request_id = str(uuid4())

    monkeypatch.setattr(
        fh,
        "_create_yookassa_refund",
        lambda *args: ("unknown", None),
    )
    first = client.post(
        f"/admin/payments/{purchase_id}/refund",
        headers=admin_h,
        json={"request_id": request_id, "amount_rub": 1800, "note": "timeout"},
    )
    assert first.status_code == 202, first.text

    _prepare_reconcile(rec, monkeypatch)
    monkeypatch.setattr(
        fh,
        "_create_yookassa_refund",
        lambda *args: ("rejected", None),
    )
    out = client.post("/admin/payments/reconcile", headers=admin_h)
    assert out.status_code == 200, out.text
    assert out.json()["refunds_failed"] == 1

    again = client.post("/admin/payments/reconcile", headers=admin_h)
    assert again.status_code == 200, again.text
    assert again.json()["refunds_checked"] == 0

    db = SessionLocal()
    try:
        refund = db.query(PaymentRefund).filter(
            PaymentRefund.request_id == request_id
        ).one()
        allowance = db.get(RefundAllowance, purchase_id)
        ent = db.get(Entitlement, eid)
        assert refund.status == "failed"
        assert allowance.reserved_amount == 0
        assert ent.balance_rub == 5000
    finally:
        db.close()


def test_reconcile_does_not_replay_stale_unknown_refund(client, monkeypatch):
    """YooKassa idempotency is 24h; after that POST retry can double-refund."""
    from app import financial_hardening as fh
    from app import reconcile as rec

    _, eid = _auth(client, "employer")
    _detach(eid, 830104)
    admin_h, _ = _auth(client, "seeker")
    client.post(
        f"/admin/wallet/{eid}/credit",
        headers=admin_h,
        json={"amount_rub": 5000, "note": "fixture"},
    )
    purchase_id = _paid_purchase(eid, "charge-stale-unknown")
    request_id = str(uuid4())

    monkeypatch.setattr(
        fh,
        "_create_yookassa_refund",
        lambda *args: ("unknown", None),
    )
    first = client.post(
        f"/admin/payments/{purchase_id}/refund",
        headers=admin_h,
        json={"request_id": request_id, "amount_rub": 1200, "note": "timeout"},
    )
    assert first.status_code == 202, first.text

    db = SessionLocal()
    try:
        refund = db.query(PaymentRefund).filter(
            PaymentRefund.request_id == request_id
        ).one()
        refund.created_at = datetime.utcnow() - timedelta(hours=25)
        db.commit()
    finally:
        db.close()

    _prepare_reconcile(rec, monkeypatch)

    def must_not_retry(*args):
        raise AssertionError("stale refund POST must not be replayed")

    monkeypatch.setattr(fh, "_create_yookassa_refund", must_not_retry)
    out = client.post("/admin/payments/reconcile", headers=admin_h)
    assert out.status_code == 200, out.text
    body = out.json()
    assert body["refunds_checked"] == 1
    assert body["refunds_manual"] == 1

    db = SessionLocal()
    try:
        refund = db.query(PaymentRefund).filter(
            PaymentRefund.request_id == request_id
        ).one()
        allowance = db.get(RefundAllowance, purchase_id)
        ent = db.get(Entitlement, eid)
        assert refund.status == "pending"
        assert allowance.reserved_amount == 1200
        assert ent.balance_rub == 3800
    finally:
        db.close()
