"""Валидация Telegram initData (Web Apps) и разбор пользователя.

Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
secret_key = HMAC_SHA256("WebAppData", bot_token)
hash = HMAC_SHA256(secret_key, data_check_string)
"""
import hashlib
import hmac
import json
from urllib.parse import parse_qsl


def _data_check_string(pairs: list[tuple[str, str]]) -> str:
    items = sorted(f"{k}={v}" for k, v in pairs if k != "hash")
    return "\n".join(items)


def validate_init_data(init_data: str, bot_token: str) -> bool:
    """Проверяет подпись initData. Пустой токен → False."""
    if not bot_token or not init_data:
        return False
    pairs = parse_qsl(init_data, keep_blank_values=True)
    received_hash = dict(pairs).get("hash", "")
    if not received_hash:
        return False
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()
    computed = hmac.new(
        secret_key, _data_check_string(pairs).encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, received_hash)


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
