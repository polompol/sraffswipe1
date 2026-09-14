"""Release-hardening for StaffSwipe money operations.

This module keeps provider verification, exactly-once top-up application,
real bank refunds and account-erasure guards in one small auditable unit.  It
replaces only the two legacy endpoints whose behaviour must change and adds a
new provider-refund endpoint; the rest of the existing routers stay untouched.
"""
from __future__ import annotations

import base64
import json
import urllib.request
from decimal import Decimal, InvalidOperation
from typing import Annotated
from urllib import error as urlerror
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .entitlements import ensure
from .financial_models import PaymentRefund, RefundAllowance
from .models import Commission, Employer, Entitlement, Purchase, User, WalletTxn
from .routers import admin_accounts, billing
from .routers.admin import require_admin
from .security import secure_equals


class BankRefundIn(BaseModel):
    request_id: UUID
    amount_rub: Annotated[int, Field(ge=1, le=100_000)]
    note: Annotated[str, Field(min_length=3, max_length=200)]


def validated_wallet_topup(payment: dict) -> tuple[str, str, int]:
    """Return ``(charge_id, owner_id, rub)`` for a trusted YooKassa payment.

    The caller must pass provider-owned data (or the dev fixture that emulates
    it), not an unverified webhook body.  Every fact that controls money is
    checked here so webhook and reconciliation cannot silently drift apart.
    """
    if payment.get("status") != "succeeded":
        raise ValueError("Платёж не проведён")
    charge_id = str(payment.get("id") or "")
    if not charge_id:
        raise ValueError("Нет id платежа")

    meta = payment.get("metadata") or {}
    owner_id = str(meta.get("owner_id") or "")
    if not owner_id or meta.get("sku") != "wallet_topup":
        raise ValueError("Некорректные metadata")

    amount = payment.get("amount") or {}
    if amount.get("currency") != "RUB":
        raise ValueError("Валюта платежа должна быть RUB")
    try:
        value = Decimal(str(amount.get("value")))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Некорректная сумма платежа") from None
    if value != value.to_integral_value():
        raise ValueError("Сумма платежа должна быть в целых рублях")
    rub = int(value)
    if not 100 <= rub <= 100_000:
        raise ValueError("Сумма вне лимита")

    try:
        declared = int(meta.get("amount_rub") or 0)
    except (TypeError, ValueError):
        declared = 0
    if declared != rub:
        raise ValueError("Сумма платежа не совпадает с metadata")
    return charge_id, owner_id, rub


def apply_verified_topup(db: Session, payment: dict, *, note: str) -> bool:
    """Apply one verified provider charge exactly once.

    The unique provider charge is claimed *before* wallet mutation inside a
    SAVEPOINT.  A concurrent webhook/reconcile loser therefore returns False
    instead of crediting again or poisoning the outer SQLAlchemy transaction.
    The caller owns the outer commit so Purchase + wallet + journal are atomic.
    """
    charge_id, owner_id, rub = validated_wallet_topup(payment)
    if db.get(Employer, owner_id) is None:
        raise ValueError("Платёж принадлежит неизвестному аккаунту")

    purchase = Purchase(
        owner_id=owner_id,
        sku="wallet_topup",
        provider="yookassa",
        amount=rub,
        currency="RUB",
        status="paid",
        provider_charge_id=charge_id,
    )
    try:
        with db.begin_nested():
            db.add(purchase)
            db.flush()
    except IntegrityError:
        return False

    billing.credit_wallet(
        db,
        owner_id,
        rub,
        note,
        kind="topup",
        commit=False,
    )
    return True


def hardened_yookassa_webhook(
    payload: dict,
    db: Session = Depends(get_db),
    secret: str = "",
):
    """Verify provider truth, then apply a charge through one idempotent path."""
    expected = settings.yookassa_webhook_secret or settings.internal_api_secret
    if not expected or not secure_equals(secret, expected):
        raise HTTPException(status_code=401, detail="Требуется внутренний токен")
    if not settings.yookassa_ready and not settings.dev_mode:
        raise HTTPException(status_code=503, detail="Оплата картой не настроена")
    if payload.get("event") != "payment.succeeded":
        return {"ok": True, "ignored": True}

    obj = payload.get("object") or {}
    charge_id = str(obj.get("id") or "")
    if not charge_id:
        raise HTTPException(status_code=400, detail="Нет id платежа")

    if settings.yookassa_ready:
        from .reconcile import fetch_payment

        verified = fetch_payment(charge_id)
        if verified is None:
            raise HTTPException(
                status_code=503,
                detail="Не удалось проверить платёж — повторите позже",
            )
        if str(verified.get("id") or "") != charge_id:
            raise HTTPException(status_code=400, detail="Ответ ЮKassa не совпал")
    else:
        # Dev tests emulate provider-owned data with the webhook object itself.
        verified = dict(obj)
        verified.setdefault("status", "succeeded")

    try:
        created = apply_verified_topup(
            db, verified, note="Пополнение картой (ЮKassa)"
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {"ok": True, **({"duplicate": True} if not created else {})}


def _create_yookassa_refund(
    charge_id: str, amount_rub: int, request_id: str
) -> tuple[str, str | None]:
    """Create one provider refund using request_id as YooKassa idempotence key.

    Returns ``(succeeded|rejected|unknown, provider_refund_id)``.  Network and
    5xx outcomes are deliberately ``unknown``: releasing the local reservation
    there could pay the same refund twice if YooKassa actually accepted it.
    """
    if not settings.yookassa_ready:
        return "rejected", None
    creds = f"{settings.yookassa_shop_id}:{settings.yookassa_secret_key}"
    auth = base64.b64encode(creds.encode()).decode()
    body = {
        "payment_id": charge_id,
        "amount": {"value": f"{amount_rub}.00", "currency": "RUB"},
    }
    req = urllib.request.Request(
        "https://api.yookassa.ru/v3/refunds",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Basic {auth}",
            "Idempotence-Key": request_id,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310
            data = json.loads(resp.read())
    except urlerror.HTTPError as exc:
        return ("rejected", None) if 400 <= exc.code < 500 else ("unknown", None)
    except (urlerror.URLError, TimeoutError, OSError, ValueError):
        return "unknown", None

    provider_id = str(data.get("id") or "") or None
    status = data.get("status")
    if status == "succeeded" and provider_id:
        return "succeeded", provider_id
    if status == "canceled":
        return "rejected", provider_id
    return "unknown", provider_id


def _refund_payload(row: PaymentRefund) -> dict:
    return {
        "id": row.id,
        "purchase_id": row.purchase_id,
        "request_id": row.request_id,
        "amount_rub": row.amount,
        "status": row.status,
        "provider_refund_id": row.provider_refund_id,
    }


def _existing_refund_response(row: PaymentRefund, purchase_id: str, amount: int):
    if row.purchase_id != purchase_id or row.amount != amount:
        raise HTTPException(
            status_code=409,
            detail="request_id уже использован для другого возврата",
        )
    if row.status == "pending":
        return JSONResponse(status_code=202, content=_refund_payload(row))
    if row.status == "failed":
        return JSONResponse(status_code=409, content=_refund_payload(row))
    return _refund_payload(row)


def _ensure_refund_allowance(db: Session, purchase_id: str) -> None:
    if db.get(RefundAllowance, purchase_id) is not None:
        return
    try:
        with db.begin_nested():
            db.add(RefundAllowance(purchase_id=purchase_id, reserved_amount=0))
            db.flush()
    except IntegrityError:
        # A concurrent request created the same per-purchase counter.
        pass


def bank_refund(
    purchase_id: str,
    body: BankRefundIn,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    """Return real YooKassa money, reserving local value before external I/O."""
    request_id = str(body.request_id)
    existing = (
        db.query(PaymentRefund)
        .filter(PaymentRefund.request_id == request_id)
        .first()
    )
    if existing is not None:
        return _existing_refund_response(existing, purchase_id, body.amount_rub)

    purchase = db.get(Purchase, purchase_id)
    if (
        purchase is None
        or purchase.provider != "yookassa"
        or purchase.sku != "wallet_topup"
        or purchase.status != "paid"
        or not purchase.provider_charge_id
    ):
        raise HTTPException(status_code=404, detail="Платёж для возврата не найден")

    # Claim request_id first.  Under concurrency the unique constraint makes
    # one request the winner before either is allowed to mutate money.
    refund = PaymentRefund(
        purchase_id=purchase.id,
        owner_id=purchase.owner_id,
        request_id=request_id,
        amount=body.amount_rub,
        status="pending",
        note=body.note,
        actor_id=str(admin.get("id") or "admin"),
    )
    try:
        with db.begin_nested():
            db.add(refund)
            db.flush()
    except IntegrityError:
        existing = (
            db.query(PaymentRefund)
            .filter(PaymentRefund.request_id == request_id)
            .first()
        )
        if existing is None:
            raise
        return _existing_refund_response(existing, purchase_id, body.amount_rub)

    _ensure_refund_allowance(db, purchase.id)
    max_before = purchase.amount - body.amount_rub
    reserved = (
        db.query(RefundAllowance)
        .filter(
            RefundAllowance.purchase_id == purchase.id,
            RefundAllowance.reserved_amount <= max_before,
        )
        .update(
            {
                RefundAllowance.reserved_amount:
                    RefundAllowance.reserved_amount + body.amount_rub
            },
            synchronize_session=False,
        )
    )
    if reserved != 1:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Возврат превысит сумму исходного платежа",
        )

    ensure(db, purchase.owner_id)
    debited = (
        db.query(Entitlement)
        .filter(
            Entitlement.owner_id == purchase.owner_id,
            Entitlement.balance_rub >= body.amount_rub,
        )
        .update(
            {Entitlement.balance_rub: Entitlement.balance_rub - body.amount_rub},
            synchronize_session=False,
        )
    )
    if debited != 1:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="На балансе недостаточно средств для банковского возврата",
        )

    db.add(
        WalletTxn(
            owner_id=purchase.owner_id,
            amount=-body.amount_rub,
            kind="provider_refund",
            note=(
                f"Возврат ЮKassa purchase={purchase.id} request={request_id}; "
                f"{body.note}"
            )[:500],
        )
    )
    db.commit()  # reservation is durable before network I/O

    try:
        outcome, provider_id = _create_yookassa_refund(
            str(purchase.provider_charge_id), body.amount_rub, request_id
        )
    except Exception:  # noqa: BLE001 — unknown is safer than accidental double refund
        outcome, provider_id = "unknown", None

    current = (
        db.query(PaymentRefund)
        .filter(PaymentRefund.request_id == request_id)
        .first()
    )
    if current is None:  # pragma: no cover - DB corruption/administrative deletion
        raise HTTPException(status_code=500, detail="Запись возврата потеряна")

    if outcome == "succeeded":
        current.status = "succeeded"
        current.provider_refund_id = provider_id
        db.commit()
        db.refresh(current)
        return _refund_payload(current)

    if outcome == "unknown":
        if provider_id:
            current.provider_refund_id = provider_id
            db.commit()
            db.refresh(current)
        return JSONResponse(status_code=202, content=_refund_payload(current))

    # Definitive 4xx/canceled result: release both local reservations.
    released = (
        db.query(RefundAllowance)
        .filter(
            RefundAllowance.purchase_id == purchase.id,
            RefundAllowance.reserved_amount >= body.amount_rub,
        )
        .update(
            {
                RefundAllowance.reserved_amount:
                    RefundAllowance.reserved_amount - body.amount_rub
            },
            synchronize_session=False,
        )
    )
    if released != 1:
        db.rollback()
        raise HTTPException(status_code=500, detail="Не удалось освободить резерв")
    db.query(Entitlement).filter(
        Entitlement.owner_id == purchase.owner_id
    ).update(
        {Entitlement.balance_rub: Entitlement.balance_rub + body.amount_rub},
        synchronize_session=False,
    )
    db.add(
        WalletTxn(
            owner_id=purchase.owner_id,
            amount=body.amount_rub,
            kind="provider_refund_release",
            note=f"ЮKassa отклонила возврат request={request_id}",
        )
    )
    current.status = "failed"
    current.provider_refund_id = provider_id
    db.commit()
    return JSONResponse(status_code=502, content=_refund_payload(current))


def hardened_erase_account(
    owner_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    """Refuse anonymisation while it would destroy money or collectable debt."""
    target = db.get(User, owner_id) or db.get(Employer, owner_id)
    if target is not None:
        ent = db.get(Entitlement, owner_id)
        if ent is not None and ent.balance_rub > 0:
            raise HTTPException(
                status_code=409,
                detail="Сначала верните или спишите остаток баланса по регламенту",
            )
        if (
            db.query(PaymentRefund.id)
            .filter(
                PaymentRefund.owner_id == owner_id,
                PaymentRefund.status == "pending",
            )
            .first()
            is not None
        ):
            raise HTTPException(
                status_code=409,
                detail="Сначала завершите ожидающий банковский возврат",
            )
        if isinstance(target, Employer) and (
            db.query(Commission.id)
            .filter(
                Commission.employer_id == owner_id,
                Commission.status == "pending",
            )
            .first()
            is not None
        ):
            raise HTTPException(
                status_code=409,
                detail="Сначала закройте задолженность по комиссии",
            )
    return admin_accounts.erase_account(owner_id, db=db, _admin=admin)


def _remove_route(router, path: str, method: str) -> None:
    router.routes[:] = [
        route
        for route in router.routes
        if not (
            getattr(route, "path", None) == path
            and method in (getattr(route, "methods", None) or set())
        )
    ]


_installed = False


def install_routes() -> None:
    """Replace legacy money-sensitive endpoints before FastAPI includes routers."""
    global _installed
    if _installed:
        return

    _remove_route(billing.router, "/billing/yookassa/webhook", "POST")
    billing.router.add_api_route(
        "/yookassa/webhook",
        hardened_yookassa_webhook,
        methods=["POST"],
        name="yookassa_webhook",
    )

    _remove_route(admin_accounts.router, "/admin/users/{owner_id}/erase", "POST")
    admin_accounts.router.add_api_route(
        "/users/{owner_id}/erase",
        hardened_erase_account,
        methods=["POST"],
        response_model=admin_accounts.EraseOut,
        name="erase_account",
    )
    admin_accounts.router.add_api_route(
        "/payments/{purchase_id}/refund",
        bank_refund,
        methods=["POST"],
        name="bank_refund",
    )
    _installed = True
