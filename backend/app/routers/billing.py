"""Деньги: ОДИН рельс — ЮKassa, единственное назначение — пополнение баланса.

С баланса автоматически списывается комиссия за закрытую смену (10%).
Ни подписок, ни Telegram Stars: подписки нигде не продавались, но их можно
было оплатить прямым запросом; Stars дублировали рельс ради фич, которые
в пилоте выдаёт оператор (буст) и реферальная программа (супер-лайки).
"""
import base64
import json
import urllib.request
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..entitlements import ensure, get_or_create
from ..models import Commission, Entitlement, Purchase, Subscription, WalletTxn
from ..security import current_principal, secure_equals

router = APIRouter(prefix="/billing", tags=["billing"])

class EntitlementsOut(BaseModel):
    plan: str
    planRenewsAt: str | None = None
    superlikeBalance: int
    boostBalance: int
    seekerPremium: bool
    employerVerified: bool


@router.get("/entitlements", response_model=EntitlementsOut)
def get_entitlements(
    principal: dict = Depends(current_principal), db: Session = Depends(get_db)
):
    ent = get_or_create(db, principal["id"])
    sub = (
        db.query(Subscription)
        .filter(Subscription.owner_id == principal["id"])
        .first()
    )
    return EntitlementsOut(
        plan=sub.plan if sub and sub.active else "free",
        planRenewsAt=sub.renews_at if sub else None,
        superlikeBalance=ent.superlike_balance,
        boostBalance=ent.boost_balance,
        seekerPremium=ent.seeker_premium,
        employerVerified=ent.employer_verified,
    )


def commission_overdue(db: Session, employer_id: str) -> bool:
    """Просрочен ли счёт по комиссии: есть pending-начисления старше срока."""
    if settings.commission_due_days <= 0:
        return False
    deadline = datetime.now(UTC) - timedelta(days=settings.commission_due_days)
    row = (
        db.query(Commission.id)
        .filter(
            Commission.employer_id == employer_id,
            Commission.status == "pending",
            Commission.created_at < deadline,
        )
        .first()
    )
    return row is not None


class CommissionInfoOut(BaseModel):
    pendingRub: int
    pendingShifts: int
    overdue: bool
    dueDays: int
    pct: int
    balanceRub: int  # денежный баланс (аванс) — комиссия списывается сама
    topupAvailable: bool  # оплата картой доступна (ЮKassa подключена / dev)


@router.get("/commission", response_model=CommissionInfoOut)
def commission_info(
    db: Session = Depends(get_db), principal: dict = Depends(current_principal)
):
    """Счёт заведения по комиссии за закрытые смены. Если на балансе есть
    аванс — комиссия списывается с него автоматически; иначе оплата по
    счёту/СБП оператору. При просрочке публикация вакансий блокируется."""
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    shifts, total = (
        db.query(
            func.count(Commission.id),
            func.coalesce(func.sum(Commission.amount), 0),
        )
        .filter(
            Commission.employer_id == principal["id"],
            Commission.status == "pending",
        )
        .one()
    )
    ent = get_or_create(db, principal["id"])
    return CommissionInfoOut(
        pendingRub=int(total),
        pendingShifts=int(shifts),
        overdue=commission_overdue(db, principal["id"]),
        dueDays=settings.commission_due_days,
        pct=settings.commission_pct,
        balanceRub=ent.balance_rub,
        topupAvailable=settings.yookassa_ready or settings.dev_mode,
    )


class PaymentOut(BaseModel):
    url: str


def _yk_payload(
    owner_id: str, sku: str, rub: int, email: str | None,
    title: str, extra_meta: dict | None = None,
) -> dict:
    """Тело запроса платежа ЮKassa (+ фискальный чек по 54-ФЗ, если включено)."""
    desc = title
    payload = {
        "amount": {"value": f"{rub}.00", "currency": "RUB"},
        "capture": True,
        "confirmation": {
            "type": "redirect",
            "return_url": settings.payment_return_url or "https://t.me",
        },
        "description": desc,
        "metadata": {"owner_id": owner_id, "sku": sku, **(extra_meta or {})},
    }
    # 54-ФЗ: чек шлём, только если касса не фискализирует сама и есть контакт.
    if settings.yookassa_send_receipt and email:
        payload["receipt"] = {
            "customer": {"email": email},
            "items": [{
                "description": desc[:128],
                "quantity": "1.00",
                "amount": {"value": f"{rub}.00", "currency": "RUB"},
                "vat_code": settings.yookassa_vat_code,
                "payment_subject": "service",
                "payment_mode": "full_payment",
            }],
        }
    return payload


def _create_yookassa_payment(
    owner_id: str, sku: str, rub: int, title: str,
    email: str | None = None, extra_meta: dict | None = None,
) -> str | None:
    """Создаёт платёж в ЮKassa и возвращает confirmation_url (или None)."""
    creds = f"{settings.yookassa_shop_id}:{settings.yookassa_secret_key}"
    auth = base64.b64encode(creds.encode()).decode()
    payload = _yk_payload(owner_id, sku, rub, email, title, extra_meta)
    req = urllib.request.Request(
        "https://api.yookassa.ru/v3/payments",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Basic {auth}",
            "Idempotence-Key": uuid.uuid4().hex,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
            data = json.loads(resp.read())
        return data.get("confirmation", {}).get("confirmation_url")
    except Exception:  # noqa: BLE001
        return None


class TopupIn(BaseModel):
    amount_rub: int
    email: str | None = None  # для фискального чека


@router.post("/wallet/topup", response_model=PaymentOut)
def wallet_topup(
    body: TopupIn,
    principal: dict = Depends(current_principal),
):
    """Пополнение денежного баланса картой через ЮKassa. Зачисление — вебхуком
    (идемпотентно). Без ключей ЮKassa — демо-ссылка; до подключения кассы
    пополнение делает оператор через админку (принял СБП → зачислил)."""
    if principal["role"] != "employer":
        raise HTTPException(status_code=403, detail="Только для работодателя")
    if not 100 <= body.amount_rub <= 100_000:
        raise HTTPException(status_code=400, detail="Сумма от 100 до 100 000 ₽")
    if not settings.yookassa_ready and not settings.dev_mode:
        # В проде без кассы кнопка не должна вести на заглушку.
        raise HTTPException(
            status_code=400,
            detail="Оплата картой скоро. Пока — переводом СБП оператору, "
                   "он зачислит на баланс.",
        )
    if settings.yookassa_ready:
        url = _create_yookassa_payment(
            principal["id"], "wallet_topup", body.amount_rub,
            title=f"Пополнение баланса StaffSwipe на {body.amount_rub} ₽",
            email=body.email,
            extra_meta={"amount_rub": str(body.amount_rub)},
        )
        if url:
            return PaymentOut(url=url)
    base = settings.payment_return_url or "https://example.com/pay"
    return PaymentOut(url=f"{base}?sku=wallet_topup&owner={principal['id']}")


def credit_wallet(
    db: Session, owner_id: str, amount: int, note: str,
    kind: str = "topup", commit: bool = True,
) -> int:
    """Зачислить деньги на баланс + записать движение. Возвращает новый баланс.

    Инкремент — атомарным UPDATE (balance = balance + amount), а НЕ
    read-modify-write: иначе гонка с автосписанием комиссии затёрла бы списание
    (заведение получило бы смену бесплатно). Правило проекта: деньги — только
    атомарными UPDATE с условием.

    commit=False — когда зачисление часть большей транзакции (вебхук оплаты):
    фиксировать её должен вызывающий, одним коммитом на всё.
    """
    ensure(db, owner_id)  # строка прав без коммита
    db.query(Entitlement).filter(Entitlement.owner_id == owner_id).update(
        {Entitlement.balance_rub: Entitlement.balance_rub + amount},
        synchronize_session=False,
    )
    db.add(WalletTxn(owner_id=owner_id, amount=amount, kind=kind, note=note))
    if commit:
        db.commit()
    else:
        db.flush()
    return int(db.get(Entitlement, owner_id).balance_rub)


@router.post("/yookassa/webhook")
def yookassa_webhook(
    payload: dict,
    db: Session = Depends(get_db),
    secret: str = "",
):
    """Вебхук ЮKassa. ЮKassa не подписывает запросы (рекомендует IP-allowlist),
    поэтому защищаемся секретом в query `?secret=`. Если задан отдельный
    yookassa_webhook_secret — используем его (отдельный секрет для вебхука)."""
    expected = settings.yookassa_webhook_secret or settings.internal_api_secret
    if not expected or not secure_equals(secret, expected):
        raise HTTPException(status_code=401, detail="Требуется внутренний токен")
    if payload.get("event") != "payment.succeeded":
        return {"ok": True, "ignored": True}
    obj = payload.get("object", {})
    meta = obj.get("metadata", {})
    owner_id, sku = meta.get("owner_id"), meta.get("sku")

    # Пополнение денежного баланса: сумма произвольная — сверяем с metadata.
    if owner_id and sku == "wallet_topup":
        try:
            rub = int(meta.get("amount_rub") or 0)
        except ValueError:
            rub = 0
        # Потолок: сверка value↔metadata самореферентна (оба поля контролирует
        # тот, кто знает секрет вебхука), поэтому единственная реальная защита от
        # неограниченной эмиссии при утечке секрета — жёсткий лимит суммы.
        if not 100 <= rub <= 100_000:
            raise HTTPException(status_code=400, detail="Сумма вне лимита")
        amount = obj.get("amount", {})
        if (
            rub <= 0
            or str(amount.get("value")) != f"{rub}.00"
            or amount.get("currency") != "RUB"
        ):
            raise HTTPException(status_code=400, detail="Сумма платежа не совпадает")
        # Без id платежа защита от повтора не работает: столбец уникален, но
        # NULL не конфликтует с NULL, и один и тот же вебхук зачислялся бы
        # снова и снова. Настоящая ЮKassa id присылает всегда.
        charge_id = obj.get("id")
        if not charge_id:
            raise HTTPException(status_code=400, detail="Нет id платежа")
        if db.query(Purchase).filter(
            Purchase.provider_charge_id == charge_id
        ).first():
            return {"ok": True, "duplicate": True}
        # ОДНА транзакция на запись платежа и зачисление денег. Раньше между
        # ними случался коммит (строка прав создавалась отдельно), и при сбое
        # в этом окне платёж оставался помеченным «оплачено», а деньги на
        # баланс не попадали. Повтор вебхука видел дубль по charge_id и молча
        # уходил — деньги терялись навсегда. Теперь при сбое откатывается всё,
        # и повторный вебхук проводит платёж заново.
        db.add(Purchase(
            owner_id=owner_id, sku="wallet_topup", provider="yookassa",
            amount=rub, currency="RUB", status="paid",
            provider_charge_id=charge_id,
        ))
        credit_wallet(db, owner_id, rub, "Пополнение картой (ЮKassa)",
                      commit=False)
        db.commit()
        return {"ok": True}

    # Других сценариев оплаты нет: пополнение баланса — единственный товар.
    raise HTTPException(status_code=400, detail="Некорректные metadata")
