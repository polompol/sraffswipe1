"""Сверка платежей с ЮKassa.

Зачем: вебхук может не дойти — сервер лежал, сеть моргнула, ЮKassa не
достучалась. Тогда деньги у ЮKassa есть, а в нашей базе их нет, и НИКТО об
этом не узнает: заведение скажет «я оплатил», оператор посмотрит в админку и
увидит ноль. Вебхук — единственный источник правды о деньгах, и полагаться
только на него нельзя.

Раз в сутки берём у ЮKassa список успешных платежей и сверяем с таблицей
purchases. Найденные пропажи ДОЗАЧИСЛЯЕМ тем же exactly-once путём, что и
вебхук. Валюта, сумма и metadata проверяются одинаково в обоих каналах.
Неопределённые банковские возвраты сверяются отдельно: известный refund id
проверяем GET-запросом, а повтор POST разрешён только внутри безопасного окна
идемпотентности провайдера.
"""
import base64
import json
import logging
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from .config import settings

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
    """Сверить платежи и неопределённые возвраты с ЮKassa.

    Every provider payment goes through the same strict validator and unique
    charge claim as the webhook.  Pending refunds stay locally reserved until
    YooKassa gives a terminal result; reconciliation never creates a second
    local reservation.
    """
    if not settings.yookassa_ready:
        return {"skipped": "ЮKassa не подключена"}

    since = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()
    try:
        items = _fetch_payments(since)
    except Exception:  # noqa: BLE001 — сверка не должна ронять крон
        _log.exception("Сверка с ЮKassa не удалась")
        return {"error": "Не удалось получить платежи ЮKassa"}

    # Import lazily: this module is also used by the verified webhook path.
    from .financial_hardening import apply_verified_topup, validated_wallet_topup
    from .refund_reconciliation import reconcile_pending_refunds

    checked = restored = restored_rub = 0
    skipped: list[str] = []
    for payment in items:
        # Only objects that look like our wallet top-ups count as checked;
        # unrelated YooKassa products are ignored, not reported as failures.
        meta = payment.get("metadata") or {}
        if meta.get("sku") != "wallet_topup" or not meta.get("owner_id"):
            continue
        checked += 1
        try:
            charge_id, owner_id, rub = validated_wallet_topup(payment)
            created = apply_verified_topup(
                db,
                payment,
                note="Пополнение картой (дозачислено сверкой)",
            )
        except ValueError as exc:
            db.rollback()
            skipped.append(f"{payment.get('id') or 'без id'}: {exc}")
            continue

        if not created:
            continue
        db.commit()
        restored += 1
        restored_rub += rub
        _log.warning(
            "Сверка: вебхук не дошёл, дозачислено %s ₽ заведению %s (%s)",
            rub,
            owner_id,
            charge_id,
        )

    refund_result = reconcile_pending_refunds(db)
    return {
        "checked": checked,
        "restored": restored,
        "restored_rub": restored_rub,
        "skipped": skipped,
        **refund_result,
    }
