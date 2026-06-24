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
    """Если в тексте есть признаки обмана — заводим системную жалобу (одну на
    цель, пока она не закрыта) и уведомляем админов. Best-effort: любые сбои
    глотаем, чтобы не ломать основной поток (вакансия/сообщение уже сохранены)."""
    try:
        word = find_scam(*texts)
        if not word:
            return
        # Не дублируем, пока есть ОТКРЫТАЯ системная жалоба на эту цель.
        # После закрытия — можно флагнуть повторно (рецидив).
        exists = (
            db.query(Report)
            .filter(
                Report.target_id == target_id,
                Report.reason == "scam",
                Report.reporter_id == "system",
                Report.status == "open",
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
    except Exception:  # noqa: BLE001 — модерация не должна ронять запрос
        db.rollback()
