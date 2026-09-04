"""Жалобы пользователей (trust & safety): фейковые вакансии, абьюз и т.п."""
from fastapi import APIRouter, Depends, HTTPException
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


def _target_exists(db: Session, target_type: str, target_id: str) -> bool:
    """Есть ли на что жаловаться. Раньше не проверялось совсем — можно было
    залить сколько угодно жалоб на выдуманные id и забить оператору очередь."""
    from ..models import Employer, Match, User, Vacancy

    if target_type == "vacancy":
        return db.get(Vacancy, target_id) is not None
    if target_type == "match":
        return db.get(Match, target_id) is not None
    return (
        db.get(User, target_id) is not None
        or db.get(Employer, target_id) is not None
    )


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
    if not _target_exists(db, body.target_type, body.target_id):
        raise HTTPException(status_code=404, detail="Цель жалобы не найдена")

    # На себя не жалуемся — это только мусор в очереди оператора.
    if body.target_id == principal["id"]:
        raise HTTPException(status_code=400, detail="Нельзя пожаловаться на себя")

    # Одна открытая жалоба от одного человека на одну цель.
    #
    # Без этого один аккаунт выглядел как толпа: двадцать жалоб «мошенничество»
    # на конкурента приходили оператору как двадцать независимых сигналов
    # (кто их подал, в панели не видно) — и невиновное заведение отправлялось
    # в бан. Обратный сценарий тот же: сотня мусорных жалоб вытесняла
    # настоящую за пределы списка, и оператор её просто не видел.
    dup = (
        db.query(Report)
        .filter(
            Report.reporter_id == principal["id"],
            Report.target_id == body.target_id,
            Report.status == "open",
        )
        .first()
    )
    if dup is not None:
        # Не ошибка для человека: он уже пожаловался, мы просто не плодим строки.
        return {"ok": True, "id": dup.id, "duplicate": True}

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
