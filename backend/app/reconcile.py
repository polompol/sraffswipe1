"""Сверка платежей с ЮKassa.

Зачем: вебхук может не дойти — сервер лежал, сеть моргнула, ЮKassa не
достучалась. Тогда деньги у ЮKassa есть, а в нашей базе их нет, и НИКТО об
этом не узнает: заведение скажет «я оплатил», оператор посмотрит в админку и
увидит ноль. Вебхук — единственный источник правды о деньгах, и полагаться
только на него нельзя.

Раз в сутки берём у ЮKassa список успешных платежей и сверяем с таблицей
purchases. Найденные пропажи ДОЗАЧИСЛЯЕМ — тем же путём и с той же защитой от
повтора, что и вебхук, поэтому двойного зачисления быть не может.
"""
import base64
import json
import logging
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from .config import settings
from .models import Purchase

_log = logging.getLogger("staffswipe")

API = "https://api.yookassa.ru/v3/payments"


def _fetch_payments(created_gte: str, limit: int = 100) -> list[dict]:
    """Успешные платежи ЮKassa с указанного момента."""
    creds = f"{settings.yookassa_shop_id}:{settings.yookassa_secret_key}"
    auth = base64.b64encode(creds.encode()).decode()
    query = urllib.parse.urlencode({
        "status": "succeeded", "created_at.gte": created_gte, "limit": limit,
    })
    req = urllib.request.Request(
        f"{API}?{query}", headers={"Authorization": f"Basic {auth}"}
    )
    with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310
        return json.loads(resp.read()).get("items", [])


def fetch_payment(charge_id: str) -> dict | None:
    """Спросить у ЮKassa про КОНКРЕТНЫЙ платёж. None — если не отдала.

    Нужен вебхуку. Вебхук ЮKassa не подписан, и защищён он секретом в адресе:
    если этот секрет утечёт (а он живёт в чужом кабинете), кто угодно сможет
    прислать «платёж прошёл, зачислите 100 000 ₽» — платежа при этом не будет,
    а деньги на балансе появятся. Сверять сумму внутри самого письма
    бессмысленно: все его поля пишет отправитель.

    Единственная настоящая проверка — спросить у ЮKassa напрямую по её же
    API, с нашими ключами, которых у отправителя письма нет.
    """
    creds = f"{settings.yookassa_shop_id}:{settings.yookassa_secret_key}"
    auth = base64.b64encode(creds.encode()).decode()
    req = urllib.request.Request(
        f"{API}/{urllib.parse.quote(charge_id)}",
        headers={"Authorization": f"Basic {auth}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310
            return json.loads(resp.read())
    except Exception:  # noqa: BLE001 — недоступность ЮKassa не должна ронять вебхук
        return None


def reconcile(db: Session, hours: int = 48) -> dict:
    """Сверить платежи за последние `hours` часов и дозачислить пропущенные.

    Возвращает сводку для оператора: сколько проверено, сколько не хватало,
    сколько денег дозачислено, что не удалось разобрать.
    """
    if not settings.yookassa_ready:
        return {"skipped": "ЮKassa не подключена"}

    since = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()
    try:
        items = _fetch_payments(since)
    except Exception as exc:  # noqa: BLE001 — сверка не должна ронять крон
        _log.error("Сверка с ЮKassa не удалась: %s", exc)
        return {"error": str(exc)[:200]}

    from .routers.billing import credit_wallet

    checked = restored = restored_rub = 0
    skipped: list[str] = []
    for it in items:
        charge_id = it.get("id")
        meta = it.get("metadata") or {}
        owner_id, sku = meta.get("owner_id"), meta.get("sku")
        if not charge_id or sku != "wallet_topup" or not owner_id:
            continue
        checked += 1
        if db.query(Purchase).filter(
            Purchase.provider_charge_id == charge_id
        ).first():
            continue  # платёж уже проведён вебхуком — всё в порядке

        # Сумму берём из САМОГО платежа, а не из metadata: metadata мы
        # заполняли сами, а value — то, что реально списала касса.
        try:
            rub = int(float((it.get("amount") or {}).get("value", 0)))
        except (TypeError, ValueError):
            rub = 0
        if not 100 <= rub <= 100_000:
            skipped.append(f"{charge_id}: сумма вне лимита ({rub})")
            continue

        db.add(Purchase(
            owner_id=owner_id, sku="wallet_topup", provider="yookassa",
            amount=rub, currency="RUB", status="paid",
            provider_charge_id=charge_id,
        ))
        credit_wallet(db, owner_id, rub,
                      "Пополнение картой (дозачислено сверкой)", commit=False)
        db.commit()
        restored += 1
        restored_rub += rub
        _log.warning(
            "Сверка: вебхук не дошёл, дозачислено %s ₽ заведению %s (%s)",
            rub, owner_id, charge_id,
        )

    return {
        "checked": checked,
        "restored": restored,
        "restored_rub": restored_rub,
        "skipped": skipped,
    }
