"""Мэтчи и подтверждение смены."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Match, Message
from ..schemas import MatchOut
from ..security import current_principal

router = APIRouter(prefix="/matches", tags=["matches"])


class AttendanceIn(BaseModel):
    attended: bool


@router.post("/{match_id}/attendance")
def mark_attendance(
    match_id: str,
    body: AttendanceIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Работодатель отмечает после смены: работник вышел или нет (надёжность)."""
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["role"] != "employer" or principal["id"] != m.employer_id:
        raise HTTPException(status_code=403, detail="Только работодатель смены")
    if m.status not in ("confirmed", "completed"):
        raise HTTPException(status_code=400, detail="Смена ещё не подтверждена")
    m.no_show = not body.attended
    db.commit()
    return {"ok": True, "noShow": m.no_show}


def _to_out(m: Match) -> MatchOut:
    return MatchOut(
        id=m.id,
        user_id=m.user_id,
        employer_id=m.employer_id,
        vacancy_id=m.vacancy_id,
        status=m.status,
        confirmed_by_seeker=m.confirmed_by_seeker,
        confirmed_by_employer=m.confirmed_by_employer,
    )


@router.get("", response_model=list[MatchOut])
def list_matches(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    col = Match.user_id if principal["role"] == "seeker" else Match.employer_id
    rows = db.query(Match).filter(col == principal["id"]).all()
    return [_to_out(m) for m in rows]


@router.post("/{match_id}/confirm", response_model=MatchOut)
def confirm(
    match_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    # Подтверждать может только участник мэтча.
    if principal["id"] not in (m.user_id, m.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к мэтчу")
    if principal["role"] == "seeker":
        m.confirmed_by_seeker = True
    else:
        m.confirmed_by_employer = True

    if m.confirmed_by_seeker and m.confirmed_by_employer and m.status == "matched":
        m.status = "confirmed"
        db.add(
            Message(
                match_id=m.id,
                sender_id="system",
                text="Смена подтверждена обеими сторонами. Сформирован акт.",
                is_system=True,
            )
        )
    db.commit()
    db.refresh(m)
    return _to_out(m)
