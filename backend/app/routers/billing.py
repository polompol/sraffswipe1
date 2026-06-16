"""Монетизация: тарифы (ЮKassa, рубли) + Boost/супер-лайки (Telegram Stars).

Цифровые товары внутри Telegram — через Stars (требование Telegram).
Подписки/верификация юрлиц — через ЮKassa.
"""
import hmac
import json
import urllib.request
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..entitlements import get_or_create
from ..models import Purchase, Subscription
from ..security import current_principal

router = APIRouter(prefix="/billing", tags=["billing"])

# Каталог товаров. provider: stars|yookassa. effect применяется после оплаты.
# Подписки работодателей — ЮKassa (рубли); микро-фичи — Telegram Stars (XTR).
CATALOG: dict[str, dict] = {
    "sub_pro_week": {
        "provider": "yookassa", "rub": 690, "title": "Pro · неделя",
        "effect": {"plan": "pro", "days": 7, "boost": 3},
    },
    "sub_pro_month": {
        "provider": "yookassa", "rub": 1990, "title": "Pro · месяц",
        "effect": {"plan": "pro", "days": 30, "boost": 10},
    },
    "sub_business": {
        "provider": "yookassa", "rub": 4990, "title": "Business · месяц",
        "effect": {"plan": "business", "days": 30, "boost": 30},
    },
    "verify_year": {
        "provider": "yookassa", "rub": 2900, "title": "Верификация заведения",
        "effect": {"verified": True, "days": 365},
    },
    "boost_24h": {
        "provider": "stars", "stars": 150, "title": "Boost 24 часа",
        "effect": {"boost": 1},
    },
    "super_5": {
        "provider": "stars", "stars": 100, "title": "5 супер-лайков",
        "effect": {"superlike": 5},
    },
    "super_20": {
        "provider": "stars", "stars": 300, "title": "20 супер-лайков",
        "effect": {"superlike": 20},
    },
    "premium_seeker": {
        "provider": "stars", "stars": 250, "title": "Premium соискателя",
        "effect": {"premium": True},
    },
}


class EntitlementsOut(BaseModel):
    plan: str
    planRenewsAt: str | None = None
    superlikeBalance: int
    boostBalance: int
    seekerPremium: bool
    employerVerified: bool


class SkuIn(BaseModel):
    sku: str


def _apply_effect(db: Session, owner_id: str, sku: str) -> None:
    """Применяет эффект SKU к правам пользователя."""
    effect = CATALOG[sku]["effect"]
    ent = get_or_create(db, owner_id)
    if "superlike" in effect:
        ent.superlike_balance += int(effect["superlike"])
    if "boost" in effect:
        ent.boost_balance += int(effect["boost"])
    if effect.get("premium"):
        ent.seeker_premium = True
    if effect.get("verified"):
        ent.employer_verified = True
    if "plan" in effect:
        days = int(effect.get("days", 30))
        renews = (datetime.now(UTC) + timedelta(days=days)).isoformat()
        sub = (
            db.query(Subscription)
            .filter(Subscription.owner_id == owner_id)
            .first()
        )
        if sub is None:
            sub = Subscription(owner_id=owner_id)
            db.add(sub)
        sub.plan = effect["plan"]
        sub.active = True
        sub.renews_at = renews
    db.commit()


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


class InvoiceOut(BaseModel):
    link: str


@router.post("/stars/invoice", response_model=InvoiceOut)
def stars_invoice(
    body: SkuIn, principal: dict = Depends(current_principal)
):
    item = CATALOG.get(body.sku)
    if item is None or item["provider"] != "stars":
        raise HTTPException(status_code=400, detail="Неизвестный SKU")

    # Boт API createInvoiceLink для currency XTR (Stars). payload = owner:sku
    payload = f"{principal['id']}:{body.sku}"
    if not settings.telegram_bot_token:
        return InvoiceOut(link=f"mock-stars-invoice://{body.sku}")

    req_body = {
        "title": item["title"],
        "description": item["title"],
        "payload": payload,
        "currency": "XTR",
        "prices": [{"label": item["title"], "amount": int(item["stars"])}],
    }
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/createInvoiceLink"
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(req_body).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
            data = json.loads(resp.read())
        if not data.get("ok"):
            raise HTTPException(status_code=502, detail="Telegram API error")
        return InvoiceOut(link=data["result"])
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001
        return InvoiceOut(link=f"mock-stars-invoice://{body.sku}")


class FulfillIn(BaseModel):
    owner_id: str
    sku: str
    provider: str
    charge_id: str | None = None


def _require_internal(token: str) -> None:
    """Доступ только внутренним вызовам (бот / вебхук) по общему секрету."""
    secret = settings.internal_api_secret
    if not secret or not hmac.compare_digest(token or "", secret):
        raise HTTPException(status_code=401, detail="Требуется внутренний токен")


@router.post("/fulfill")
def fulfill(
    body: FulfillIn,
    db: Session = Depends(get_db),
    x_internal_token: str = Header(default=""),
):
    """Начисление прав после оплаты. Вызывается ботом (Stars) или вебхуком
    ЮKassa с заголовком X-Internal-Token. Идемпотентно по charge_id."""
    _require_internal(x_internal_token)
    if body.sku not in CATALOG:
        raise HTTPException(status_code=400, detail="Неизвестный SKU")
    if body.charge_id:
        dup = (
            db.query(Purchase)
            .filter(Purchase.provider_charge_id == body.charge_id)
            .first()
        )
        if dup:
            return {"ok": True, "duplicate": True}
    item = CATALOG[body.sku]
    db.add(Purchase(
        owner_id=body.owner_id,
        sku=body.sku,
        provider=body.provider,
        amount=int(item.get("stars") or item.get("rub") or 0),
        currency="XTR" if body.provider == "stars" else "RUB",
        status="paid",
        provider_charge_id=body.charge_id,
    ))
    _apply_effect(db, body.owner_id, body.sku)
    return {"ok": True}


class PaymentOut(BaseModel):
    url: str


@router.post("/yookassa/payment", response_model=PaymentOut)
def yookassa_payment(
    body: SkuIn, principal: dict = Depends(current_principal)
):
    item = CATALOG.get(body.sku)
    if item is None or item["provider"] != "yookassa":
        raise HTTPException(status_code=400, detail="Неизвестный SKU")
    # В проде: создаём платёж через ЮKassa API с metadata={owner_id, sku}
    # и возвращаем confirmation_url. Без ключей — демо-ссылка (webview).
    base = settings.payment_return_url or "https://example.com/pay"
    return PaymentOut(url=f"{base}?sku={body.sku}&owner={principal['id']}")


@router.post("/yookassa/webhook")
def yookassa_webhook(
    payload: dict,
    db: Session = Depends(get_db),
    secret: str = "",
):
    """Вебхук ЮKassa. ЮKassa не подписывает запросы (рекомендует IP-allowlist),
    поэтому защищаемся общим секретом в query `?secret=`."""
    _require_internal(secret)
    if payload.get("event") != "payment.succeeded":
        return {"ok": True, "ignored": True}
    obj = payload.get("object", {})
    meta = obj.get("metadata", {})
    owner_id, sku = meta.get("owner_id"), meta.get("sku")
    if not owner_id or sku not in CATALOG:
        raise HTTPException(status_code=400, detail="Некорректные metadata")
    charge_id = obj.get("id")
    if charge_id and db.query(Purchase).filter(
        Purchase.provider_charge_id == charge_id
    ).first():
        return {"ok": True, "duplicate": True}
    db.add(Purchase(
        owner_id=owner_id, sku=sku, provider="yookassa",
        amount=int(CATALOG[sku].get("rub") or 0), currency="RUB",
        status="paid", provider_charge_id=charge_id,
    ))
    _apply_effect(db, owner_id, sku)
    return {"ok": True}
