"""Валидация Telegram initData (Web Apps) и разбор пользователя.

Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
secret_key = HMAC_SHA256("WebAppData", bot_token)
hash = HMAC_SHA256(secret_key, data_check_string)
"""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

# Срок годности initData по умолчанию (сек). Защита от повторного использования
# перехваченной подписи: Telegram рекомендует отвергать старые initData.
DEFAULT_MAX_AGE = 24 * 3600


def _data_check_string(pairs: list[tuple[str, str]]) -> str:
    items = sorted(f"{k}={v}" for k, v in pairs if k != "hash")
    return "\n".join(items)


def validate_init_data(
    init_data: str, bot_token: str, max_age_seconds: int = DEFAULT_MAX_AGE
) -> bool:
    """Проверяет подпись initData и свежесть auth_date. Пустой токен → False."""
    if not bot_token or not init_data:
        return False
    pairs = parse_qsl(init_data, keep_blank_values=True)
    fields = dict(pairs)
    received_hash = fields.get("hash", "")
    if not received_hash:
        return False
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()
    computed = hmac.new(
        secret_key, _data_check_string(pairs).encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        return False
    # Подпись верна — проверяем возраст, чтобы перехваченную initData нельзя
    # было переиспользовать спустя время (replay).
    if max_age_seconds:
        try:
            auth_date = int(fields.get("auth_date", "0"))
        except ValueError:
            return False
        if auth_date <= 0 or time.time() - auth_date > max_age_seconds:
            return False
    return True


def parse_user(init_data: str) -> dict | None:
    """Возвращает объект user из initData (или None)."""
    raw = dict(parse_qsl(init_data, keep_blank_values=True)).get("user")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def parse_start_param(init_data: str) -> str:
    """Возвращает start_param из initData (deep-link Mini App), напр. 'ref_<id>'."""
    return dict(parse_qsl(init_data, keep_blank_values=True)).get(
        "start_param", ""
    )
