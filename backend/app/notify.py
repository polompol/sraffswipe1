"""Уведомления пользователям через Telegram-бота (best-effort).

Backend шлёт sendMessage напрямую (есть токен бота). Без токена/без tg_id —
тихий no-op, чтобы не ломать основной поток. HTTP-вызов уходит в фоновый
поток, поэтому медленный/недоступный Telegram не тормозит запрос пользователя
и не блокирует event-loop в async-ручках.
"""
import json
import threading
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


def _send(token: str, tg: int, text: str) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({"chat_id": tg, "text": text}).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)  # noqa: S310
    except Exception:  # noqa: BLE001
        pass


def notify_owner(db: Session, owner_id: str, text: str) -> None:
    """Отправить текст пользователю/работодателю по его tg_id (не блокируя)."""
    token = settings.telegram_bot_token
    if not token:
        return
    tg = _tg_id(db, owner_id)
    if not tg:
        return
    threading.Thread(
        target=_send, args=(token, tg, text), daemon=True
    ).start()
