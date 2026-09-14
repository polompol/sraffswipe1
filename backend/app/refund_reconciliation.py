"""Safe reconciliation for ambiguous YooKassa bank refunds.

A refund POST can have an unknown outcome after a timeout or provider 5xx.  In
that case StaffSwipe keeps the local wallet value reserved.  Reconciliation
resolves that ambiguity without ever creating a second local reservation.

YooKassa guarantees POST idempotency for 24 hours.  We deliberately stop
replaying an unknown POST after 23 hours to leave safety margin.  If the
provider refund id is already known, a GET by id is safe at any age.
"""
from __future__ import annotations

import base64
import json
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from urllib import error as urlerror

from sqlalchemy.orm import Session

from . import financial_hardening as fh
from .config import settings
from .financial_models import PaymentRefund, RefundAllowance
from .models import Entitlement, Purchase, WalletTxn

_REFUND_POST_RETRY_WINDOW = timedelta(hours=23)
_REFUND_BATCH_LIMIT = 100


def _fetch_yookassa_refund(refund_id: str) -> tuple[str, str | None]:
    """Return provider truth for an existing refund without mutating money."""
    if not settings.yookassa_ready:
        return "unknown", refund_id

    creds = f"{settings.yookassa_shop_id}:{settings.yookassa_secret_key}"
    auth = base64.b64encode(creds.encode()).decode()
    safe_id = urllib.parse.quote(refund_id, safe="")
    req = urllib.request.Request(
        f"https://api.yookassa.ru/v3/refunds/{safe_id}",
        headers={"Authorization": f"Basic {auth}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310
            data = json.loads(resp.read())
    except (urlerror.HTTPError, urlerror.URLError, TimeoutError, OSError, ValueError):
        return "unknown", refund_id

    provider_id = str(data.get("id") or refund_id)
    status = data.get("status")
    if status == "succeeded":
        return "succeeded", provider_id
    if status == "canceled":
        return "rejected", provider_id
    return "unknown", provider_id


def _provider_refund_status(refund_id: str) -> tuple[str, str | None]:
    """Test seam plus the real GET implementation."""
    override = getattr(fh, "_fetch_yookassa_refund", None)
    if override is not None:
        return override(refund_id)
    return _fetch_yookassa_refund(refund_id)


def _mark_succeeded(
    db: Session,
    row: PaymentRefund,
    provider_id: str | None,
) -> bool:
    """Atomically move one still-pending row to succeeded."""
    values = {PaymentRefund.status: "succeeded"}
    if provider_id:
        values[PaymentRefund.provider_refund_id] = provider_id
    won = (
        db.query(PaymentRefund)
        .filter(PaymentRefund.id == row.id, PaymentRefund.status == "pending")
        .update(values, synchronize_session=False)
    )
    if won != 1:
        db.rollback()
        return False
    db.commit()
    return True


def _release_rejected(
    db: Session,
    row: PaymentRefund,
    provider_id: str | None,
) -> bool:
    """Release a rejected refund exactly once, guarded by pending->failed claim."""
    values = {PaymentRefund.status: "failed"}
    if provider_id:
        values[PaymentRefund.provider_refund_id] = provider_id

    claimed = (
        db.query(PaymentRefund)
        .filter(PaymentRefund.id == row.id, PaymentRefund.status == "pending")
        .update(values, synchronize_session=False)
    )
    if claimed != 1:
        db.rollback()
        return False

    released = (
        db.query(RefundAllowance)
        .filter(
            RefundAllowance.purchase_id == row.purchase_id,
            RefundAllowance.reserved_amount >= row.amount,
        )
        .update(
            {
                RefundAllowance.reserved_amount:
                    RefundAllowance.reserved_amount - row.amount
            },
            synchronize_session=False,
        )
    )
    credited = (
        db.query(Entitlement)
        .filter(Entitlement.owner_id == row.owner_id)
        .update(
            {Entitlement.balance_rub: Entitlement.balance_rub + row.amount},
            synchronize_session=False,
        )
    )
    if released != 1 or credited != 1:
        # Roll back the terminal status as well.  A stuck reservation is safer
        # than crediting a wallet without being able to prove/release the
        # corresponding purchase allowance.
        db.rollback()
        return False

    db.add(
        WalletTxn(
            owner_id=row.owner_id,
            amount=row.amount,
            kind="provider_refund_release",
            note=f"ЮKassa отклонила возврат request={row.request_id} (сверка)",
        )
    )
    db.commit()
    return True


def _remember_provider_id(
    db: Session,
    row: PaymentRefund,
    provider_id: str | None,
) -> bool:
    """Persist a newly learned provider id without changing refund status."""
    if not provider_id:
        return True
    if row.provider_refund_id:
        return row.provider_refund_id == provider_id

    updated = (
        db.query(PaymentRefund)
        .filter(
            PaymentRefund.id == row.id,
            PaymentRefund.status == "pending",
            PaymentRefund.provider_refund_id.is_(None),
        )
        .update(
            {PaymentRefund.provider_refund_id: provider_id},
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        return False
    db.commit()
    return True


def reconcile_pending_refunds(db: Session) -> dict[str, int]:
    """Resolve pending refunds while preserving every money invariant.

    Provider calls may happen concurrently across reconciliation workers, but
    only the worker that atomically claims ``status='pending'`` may perform the
    local release on a definitive rejection.  Successful outcomes require no
    local balance movement because the reservation already represents money
    that left the StaffSwipe wallet.
    """
    counters = {
        "refunds_checked": 0,
        "refunds_succeeded": 0,
        "refunds_failed": 0,
        "refunds_pending": 0,
        "refunds_manual": 0,
    }
    rows = (
        db.query(PaymentRefund)
        .filter(PaymentRefund.status == "pending")
        .order_by(PaymentRefund.created_at.asc())
        .limit(_REFUND_BATCH_LIMIT)
        .all()
    )
    now = datetime.now(UTC).replace(tzinfo=None)

    for row in rows:
        counters["refunds_checked"] += 1
        purchase = db.get(Purchase, row.purchase_id)
        if (
            purchase is None
            or purchase.provider != "yookassa"
            or purchase.sku != "wallet_topup"
            or purchase.status != "paid"
            or not purchase.provider_charge_id
        ):
            counters["refunds_manual"] += 1
            continue

        if row.provider_refund_id:
            try:
                outcome, provider_id = _provider_refund_status(
                    row.provider_refund_id
                )
            except Exception:  # noqa: BLE001 — provider ambiguity stays reserved
                outcome, provider_id = "unknown", row.provider_refund_id
        else:
            created_at = row.created_at
            if created_at is None or now - created_at >= _REFUND_POST_RETRY_WINDOW:
                counters["refunds_manual"] += 1
                continue
            try:
                outcome, provider_id = fh._create_yookassa_refund(
                    str(purchase.provider_charge_id),
                    row.amount,
                    row.request_id,
                )
            except Exception:  # noqa: BLE001 — unknown is fail-closed
                outcome, provider_id = "unknown", None

        if outcome == "succeeded":
            if _mark_succeeded(db, row, provider_id):
                counters["refunds_succeeded"] += 1
            continue

        if outcome == "rejected":
            if _release_rejected(db, row, provider_id):
                counters["refunds_failed"] += 1
            else:
                counters["refunds_manual"] += 1
            continue

        if not _remember_provider_id(db, row, provider_id):
            counters["refunds_manual"] += 1
            continue
        counters["refunds_pending"] += 1

    return counters
