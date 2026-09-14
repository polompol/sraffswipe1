"""Release-blocking financial integrity regressions.

These tests deliberately cover retry/race boundaries rather than UI copy:
provider charges must credit once, real refunds must reserve once, and account
erasure must never destroy unresolved money or debt.
"""
from uuid import uuid4

from app.db import SessionLocal
from app.financial_models import RefundAllowance
from app.models import Commission, Entitlement, Match, Purchase, Vacancy, WalletTxn


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


def _setup(client, tg_id: int):
    employer_h, eid = _auth(client, "employer")
    _detach(eid, tg_id)
    admin_h, admin_uid = _auth(client, "seeker")  # tg_id=0 is admin in tests
    return employer_h, admin_h, eid, admin_uid


def _balance(owner_id: str) -> int:
    db = SessionLocal()
    try:
        row = db.get(Entitlement, owner_id)
        return int(row.balance_rub) if row else 0
    finally:
        db.close()


def _paid_purchase(eid: str, amount: int, suffix: str) -> str:
    db = SessionLocal()
    try:
        p = Purchase(
            owner_id=eid,
            sku="wallet_topup",
            provider="yookassa",
            amount=amount,
            currency="RUB",
            status="paid",
            provider_charge_id=f"charge-{suffix}",
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p.id
    finally:
        db.close()


def _refund_total(purchase_id: str) -> int:
    db = SessionLocal()
    try:
        row = db.get(RefundAllowance, purchase_id)
        return int(row.reserved_amount) if row else 0
    finally:
        db.close()


def test_shared_topup_helper_claims_provider_charge_once(client):
    from app.financial_hardening import apply_verified_topup

    _, _, eid, _ = _setup(client, 830001)
    payment = {
        "id": "exactly-once-charge",
        "status": "succeeded",
        "amount": {"value": "2500.00", "currency": "RUB"},
        "metadata": {
            "owner_id": eid,
            "sku": "wallet_topup",
            "amount_rub": "2500",
        },
    }

    db = SessionLocal()
    try:
        assert apply_verified_topup(db, payment, note="test topup") is True
        db.commit()
        assert apply_verified_topup(db, payment, note="duplicate") is False
        db.commit()
    finally:
        db.close()

    assert _balance(eid) == 2500
    db = SessionLocal()
    try:
        assert db.query(Purchase).filter(
            Purchase.provider_charge_id == "exactly-once-charge"
        ).count() == 1
        assert db.query(WalletTxn).filter(
            WalletTxn.owner_id == eid, WalletTxn.amount == 2500
        ).count() == 1
    finally:
        db.close()


def test_reconcile_rejects_wrong_currency(client, monkeypatch):
    from app import reconcile as rec

    _, admin_h, eid, _ = _setup(client, 830002)
    monkeypatch.setattr(rec.settings, "yookassa_shop_id", "shop", False)
    monkeypatch.setattr(rec.settings, "yookassa_secret_key", "key", False)
    monkeypatch.setattr(rec, "_fetch_payments", lambda *a, **kw: [{
        "id": "wrong-currency",
        "status": "succeeded",
        "amount": {"value": "3000.00", "currency": "USD"},
        "metadata": {
            "owner_id": eid,
            "sku": "wallet_topup",
            "amount_rub": "3000",
        },
    }])

    body = client.post("/admin/payments/reconcile", headers=admin_h).json()
    assert body["restored"] == 0
    assert _balance(eid) == 0


def test_reconcile_rejects_metadata_amount_mismatch(client, monkeypatch):
    from app import reconcile as rec

    _, admin_h, eid, _ = _setup(client, 830003)
    monkeypatch.setattr(rec.settings, "yookassa_shop_id", "shop", False)
    monkeypatch.setattr(rec.settings, "yookassa_secret_key", "key", False)
    monkeypatch.setattr(rec, "_fetch_payments", lambda *a, **kw: [{
        "id": "wrong-metadata-amount",
        "status": "succeeded",
        "amount": {"value": "3000.00", "currency": "RUB"},
        "metadata": {
            "owner_id": eid,
            "sku": "wallet_topup",
            "amount_rub": "4000",
        },
    }])

    body = client.post("/admin/payments/reconcile", headers=admin_h).json()
    assert body["restored"] == 0
    assert _balance(eid) == 0


def test_bank_refund_retry_reserves_once(client, monkeypatch):
    from app import financial_hardening as fh

    _, admin_h, eid, _ = _setup(client, 830004)
    client.post(
        f"/admin/wallet/{eid}/credit", headers=admin_h,
        json={"amount_rub": 5000, "note": "provider topup fixture"},
    )
    pid = _paid_purchase(eid, 5000, "retry")
    calls = []

    def provider(charge_id, amount, request_id):
        calls.append((charge_id, amount, request_id))
        return "succeeded", "refund-provider-1"

    monkeypatch.setattr(fh, "_create_yookassa_refund", provider)
    request_id = str(uuid4())
    body = {"request_id": request_id, "amount_rub": 2000, "note": "возврат"}

    first = client.post(f"/admin/payments/{pid}/refund", headers=admin_h, json=body)
    second = client.post(f"/admin/payments/{pid}/refund", headers=admin_h, json=body)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["status"] == "succeeded"
    assert second.json()["status"] == "succeeded"
    assert len(calls) == 1
    assert _balance(eid) == 3000
    assert _refund_total(pid) == 2000


def test_bank_refund_total_cannot_exceed_purchase(client, monkeypatch):
    from app import financial_hardening as fh

    _, admin_h, eid, _ = _setup(client, 830005)
    client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                json={"amount_rub": 7000})
    pid = _paid_purchase(eid, 5000, "cap")
    monkeypatch.setattr(
        fh,
        "_create_yookassa_refund",
        lambda *a: ("succeeded", f"refund-{a[2]}"),
    )

    one = client.post(
        f"/admin/payments/{pid}/refund", headers=admin_h,
        json={"request_id": str(uuid4()), "amount_rub": 3000, "note": "part 1"},
    )
    two = client.post(
        f"/admin/payments/{pid}/refund", headers=admin_h,
        json={"request_id": str(uuid4()), "amount_rub": 3000, "note": "part 2"},
    )
    assert one.status_code == 200, one.text
    assert two.status_code == 409, two.text
    assert _balance(eid) == 4000
    assert _refund_total(pid) == 3000


def test_bank_refund_cannot_exceed_available_wallet(client, monkeypatch):
    from app import financial_hardening as fh

    _, admin_h, eid, _ = _setup(client, 830006)
    client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                json={"amount_rub": 1000})
    pid = _paid_purchase(eid, 5000, "balance")
    monkeypatch.setattr(
        fh,
        "_create_yookassa_refund",
        lambda *a: ("succeeded", "should-not-run"),
    )

    r = client.post(
        f"/admin/payments/{pid}/refund", headers=admin_h,
        json={"request_id": str(uuid4()), "amount_rub": 2000, "note": "too much"},
    )
    assert r.status_code == 409
    assert _balance(eid) == 1000
    assert _refund_total(pid) == 0


def test_definitive_refund_rejection_restores_reservation(client, monkeypatch):
    from app import financial_hardening as fh

    _, admin_h, eid, _ = _setup(client, 830007)
    client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                json={"amount_rub": 5000})
    pid = _paid_purchase(eid, 5000, "reject")
    monkeypatch.setattr(
        fh,
        "_create_yookassa_refund",
        lambda *a: ("rejected", None),
    )

    r = client.post(
        f"/admin/payments/{pid}/refund", headers=admin_h,
        json={"request_id": str(uuid4()), "amount_rub": 2000, "note": "reject"},
    )
    assert r.status_code == 502
    assert _balance(eid) == 5000
    assert _refund_total(pid) == 0


def test_ambiguous_refund_stays_pending_and_reserved(client, monkeypatch):
    from app import financial_hardening as fh

    _, admin_h, eid, _ = _setup(client, 830008)
    client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                json={"amount_rub": 5000})
    pid = _paid_purchase(eid, 5000, "unknown")
    calls = []

    def unknown(*args):
        calls.append(args)
        return "unknown", None

    monkeypatch.setattr(fh, "_create_yookassa_refund", unknown)
    request_id = str(uuid4())
    payload = {"request_id": request_id, "amount_rub": 2000, "note": "timeout"}

    first = client.post(f"/admin/payments/{pid}/refund", headers=admin_h, json=payload)
    second = client.post(f"/admin/payments/{pid}/refund", headers=admin_h, json=payload)
    assert first.status_code == 202, first.text
    assert second.status_code == 202, second.text
    assert first.json()["status"] == "pending"
    assert len(calls) == 1
    assert _balance(eid) == 3000
    assert _refund_total(pid) == 2000


def test_erase_blocked_while_wallet_has_money(client):
    _, admin_h, eid, _ = _setup(client, 830009)
    client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                json={"amount_rub": 1000})

    r = client.post(f"/admin/users/{eid}/erase", headers=admin_h)
    assert r.status_code == 409
    assert _balance(eid) == 1000


def test_erase_blocked_while_commission_is_pending(client):
    _, admin_h, eid, admin_uid = _setup(client, 830010)
    db = SessionLocal()
    try:
        vacancy = Vacancy(
            employer_id=eid,
            role="waiter",
            date="2026-09-14",
            start_time=600,
            end_time=1080,
            rate=3000,
            rate_type="perShift",
        )
        db.add(vacancy)
        db.flush()
        match = Match(
            user_id=admin_uid,
            employer_id=eid,
            vacancy_id=vacancy.id,
            status="completed",
        )
        db.add(match)
        db.flush()
        db.add(Commission(
            employer_id=eid,
            match_id=match.id,
            shift_pay=3000,
            amount=300,
            status="pending",
        ))
        db.commit()
    finally:
        db.close()

    r = client.post(f"/admin/users/{eid}/erase", headers=admin_h)
    assert r.status_code == 409


def test_erase_blocked_while_bank_refund_is_pending(client, monkeypatch):
    from app import financial_hardening as fh

    _, admin_h, eid, _ = _setup(client, 830011)
    client.post(f"/admin/wallet/{eid}/credit", headers=admin_h,
                json={"amount_rub": 5000})
    pid = _paid_purchase(eid, 5000, "erase-pending")
    monkeypatch.setattr(
        fh,
        "_create_yookassa_refund",
        lambda *a: ("unknown", None),
    )
    rr = client.post(
        f"/admin/payments/{pid}/refund", headers=admin_h,
        json={"request_id": str(uuid4()), "amount_rub": 2000, "note": "pending"},
    )
    assert rr.status_code == 202, rr.text

    r = client.post(f"/admin/users/{eid}/erase", headers=admin_h)
    assert r.status_code == 409
