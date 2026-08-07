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


def _send(token: str, tg: int, text: str, open_app: str | None = None) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    body: dict = {"chat_id": tg, "text": text}
    # Кнопка «открыть приложение» прямо в сообщении: человек отмечается на
    # смене в один тап из бота, а не ищет приложение и нужный экран.
    # web_app открывает Mini App внутри Telegram — вход по обычному initData,
    # отдельного доверенного канала для бота не появляется.
    if open_app and settings.mini_app_url:
        body["reply_markup"] = {
            "inline_keyboard": [[{
                "text": open_app,
                "web_app": {"url": settings.mini_app_url},
            }]]
        }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)  # noqa: S310
    except Exception:  # noqa: BLE001
        pass


def notify_owner(
    db: Session, owner_id: str, text: str, open_app: str | None = None
) -> None:
    """Отправить текст пользователю/работодателю по его tg_id (не блокируя).
    `open_app` — подпись кнопки, открывающей Mini App прямо из сообщения."""
    token = settings.telegram_bot_token
    if not token:
        return
    tg = _tg_id(db, owner_id)
    if not tg:
        return
    threading.Thread(
        target=_send, args=(token, tg, text, open_app), daemon=True
    ).start()


def notify_admins(text: str) -> None:
    """Уведомить администраторов (ADMIN_TG_IDS) — напрямую по их tg_id."""
    token = settings.telegram_bot_token
    if not token:
        return
    for raw in settings.admin_tg_ids.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            tg = int(raw)
        except ValueError:
            continue
        threading.Thread(
            target=_send, args=(token, tg, text), daemon=True
        ).start()
