"""Уведомления пользователям через Telegram-бота (best-effort).

Backend шлёт sendMessage напрямую (есть токен бота). Без токена/без tg_id —
тихий no-op, чтобы не ломать основной поток.
"""
import json
import urllib.request

from sqlalchemy.orm import Session

from .config import settings
from .models import Employer, User


def _tg_id(db: Session, owner_id: str) -> int | None:
    u = db.get(User, owner_id)
    if u is not None:
        return u.tg_id
    e = db.get(Employer, owner_id)
    return e.tg_id if e is not None else None


def notify_owner(db: Session, owner_id: str, text: str) -> None:
    """Отправить текст пользователю/работодателю по его tg_id."""
    if not settings.telegram_bot_token:
        return
    tg = _tg_id(db, owner_id)
    if not tg:
        return
    url = (
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    )
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({"chat_id": tg, "text": text}).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)  # noqa: S310
    except Exception:  # noqa: BLE001
        pass
