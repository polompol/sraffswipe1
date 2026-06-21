"""Авто-модерация: ловим типичные мошеннические формулировки в вакансиях и
чате до того, как на них пожалуются. Создаём системную жалобу + пингуем админа.
"""
from sqlalchemy.orm import Session

from .models import Report
from .notify import notify_admins

# Частые признаки обмана на job-площадках (предоплата, переводы, «купи форму»).
SCAM_PATTERNS = [
    "предоплат", "внеси", "взнос", "залог", "переведи", "перевод денег",
    "комисси", "оплати картой", "оплата картой", "купи форму", "купить форму",
    "страховой", "qiwi", "киви", "вебмани", "webmoney", "яндекс деньги",
    "перевод на карту", "пришли деньги", "оплати доступ",
]


def find_scam(*texts: str) -> str | None:
    """Возвращает найденный подозрительный фрагмент или None."""
    blob = " ".join(t or "" for t in texts).lower()
    for w in SCAM_PATTERNS:
        if w in blob:
            return w
    return None


def auto_flag(db: Session, target_type: str, target_id: str, *texts: str) -> None:
    """Если в тексте есть признаки обмана — заводим системную жалобу (один раз
    на цель) и уведомляем админов. Best-effort: не ломает основной поток."""
    word = find_scam(*texts)
    if not word:
        return
    exists = (
        db.query(Report)
        .filter(
            Report.target_id == target_id,
            Report.reason == "scam",
            Report.reporter_id == "system",
        )
        .first()
    )
    if exists:
        return
    db.add(Report(
        reporter_id="system",
        target_type=target_type,
        target_id=target_id,
        reason="scam",
        text=f"Авто-флаг: «{word}»",
    ))
    db.commit()
    notify_admins(
        f"🚩 Авто-подозрение на обман в {target_type} ({target_id[:12]}): "
        f"«{word}». Откройте админ-панель."
    )
