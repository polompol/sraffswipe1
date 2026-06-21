"""Жалобы пользователей (trust & safety): фейковые вакансии, абьюз и т.п."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Report
from ..notify import notify_admins, notify_owner
from ..ratelimit import rate_limit
from ..schemas import ReportIn
from ..security import current_principal

router = APIRouter(prefix="/reports", tags=["reports"])

_REASON_RU = {
    "fake": "Фейк", "scam": "Мошенничество", "spam": "Спам",
    "abuse": "Абьюз", "other": "Другое",
}


@router.post(
    "",
    status_code=201,
    dependencies=[Depends(rate_limit("report", 10, 60))],
)
def create_report(
    body: ReportIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Принять жалобу. Модерация — вручную на пилоте (потом админ-панель)."""
    rep = Report(
        reporter_id=principal["id"],
        target_type=body.target_type,
        target_id=body.target_id,
        reason=body.reason,
        text=body.text,
    )
    db.add(rep)
    db.commit()
    # Подтверждение жалобщику.
    notify_owner(db, principal["id"], "✅ Жалоба принята. Спасибо, мы проверим.")
    # Сигнал админам в Telegram — чтобы не заходить в админку проверять вручную.
    reason_ru = _REASON_RU.get(body.reason, body.reason)
    note = f": {body.text[:120]}" if body.text else ""
    notify_admins(
        f"🚨 Новая жалоба: {reason_ru} на {body.target_type} "
        f"({body.target_id[:12]}){note}. Откройте админ-панель StaffSwipe."
    )
    return {"ok": True, "id": rep.id}
