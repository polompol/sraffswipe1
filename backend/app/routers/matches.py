"""Мэтчи и подтверждение смены."""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..geo import distance_km
from ..models import Match, Message, Vacancy
from ..schemas import MatchOut
from ..security import current_principal

router = APIRouter(prefix="/matches", tags=["matches"])

# Радиус, в пределах которого гео-отметка «я на смене» считается валидной.
_CHECKIN_RADIUS_KM = 0.3


class AttendanceIn(BaseModel):
    attended: bool


class CheckinIn(BaseModel):
    # Отметиться можно ДВУМЯ путями: код от заведения ИЛИ геолокация на месте
    # (чтобы работник не зависел от того, покажет ли заведение код).
    code: str | None = None
    lat: float | None = None
    lng: float | None = None


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


def _to_out(m: Match, role: str = "") -> MatchOut:
    # Код прихода показываем ТОЛЬКО заведению и только пока смена подтверждена,
    # но ещё не закрыта чек-ином. Работник узнаёт код у заведения на месте.
    show_code = role == "employer" and m.status == "confirmed" and bool(m.checkin_code)
    return MatchOut(
        id=m.id,
        user_id=m.user_id,
        employer_id=m.employer_id,
        vacancy_id=m.vacancy_id,
        status=m.status,
        confirmed_by_seeker=m.confirmed_by_seeker,
        confirmed_by_employer=m.confirmed_by_employer,
        checkin_code=m.checkin_code if show_code else None,
        checked_in=m.status == "completed",
    )


@router.get("", response_model=list[MatchOut])
def list_matches(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    col = Match.user_id if principal["role"] == "seeker" else Match.employer_id
    rows = db.query(Match).filter(col == principal["id"]).all()
    return [_to_out(m, principal["role"]) for m in rows]


@router.post("/{match_id}/checkin", response_model=MatchOut)
def checkin(
    match_id: str,
    body: CheckinIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Работник отмечается на смене кодом, который назвало заведение на месте.
    Доказательство, что смена состоялась через сервис (основа для комиссии и
    честной надёжности). Закрывает смену как выполненную."""
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["role"] != "seeker" or principal["id"] != m.user_id:
        raise HTTPException(status_code=403, detail="Отметиться может только работник")
    if m.status != "confirmed":
        raise HTTPException(status_code=400, detail="Смена не подтверждена")

    # Путь 1 — код от заведения. Путь 2 — геолокация: работник физически на
    # месте смены, даже если заведение код не назвало.
    by_code = bool(
        body.code and m.checkin_code and body.code.strip() == m.checkin_code
    )
    by_geo = False
    if body.lat is not None and body.lng is not None:
        v = db.get(Vacancy, m.vacancy_id)
        if v is not None and (v.lat or v.lng):
            by_geo = distance_km(body.lat, body.lng, v.lat, v.lng) <= _CHECKIN_RADIUS_KM
    if not (by_code or by_geo):
        raise HTTPException(
            status_code=400,
            detail="Не удалось отметиться: неверный код или вы не на месте смены",
        )
    m.status = "completed"
    m.no_show = False
    db.add(Message(
        match_id=m.id, sender_id="system",
        text="Работник отметился на смене ✓ Смена закрыта.", is_system=True,
    ))
    db.commit()
    db.refresh(m)
    return _to_out(m, principal["role"])


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
        m.checkin_code = f"{secrets.randbelow(10000):04d}"  # код прихода
        db.add(
            Message(
                match_id=m.id,
                sender_id="system",
                text="Смена подтверждена. Заведение назовёт код прихода на месте — "
                     "работник вводит его, чтобы отметиться.",
                is_system=True,
            )
        )
    db.commit()
    db.refresh(m)
    return _to_out(m, principal["role"])
