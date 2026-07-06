"""Живая лента активности — социальное доказательство («тут кипит жизнь»)."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Match, Swipe, User, Vacancy
from ..security import current_principal

router = APIRouter(prefix="/activity", tags=["activity"])


class ActivityItem(BaseModel):
    kind: str  # closed|urgent
    text: str
    ago_min: int


class ActivityOut(BaseModel):
    items: list[ActivityItem]
    searching_now: int  # сколько людей ищут смену рядом сейчас
    urgent_today: int  # сколько срочных смен на сегодня


def _shift_pay(rate: int, rate_type: str, start: int, end: int) -> int:
    if rate_type == "perShift":
        return rate
    mins = end - start
    if mins <= 0:
        mins += 1440
    return round(rate * mins / 60)


def _ago_min(then: datetime) -> int:
    if then.tzinfo is None:
        then = then.replace(tzinfo=UTC)
    delta = datetime.now(UTC) - then
    return max(0, int(delta.total_seconds() // 60))


def _first_name(name: str) -> str:
    """Только имя (без фамилии) — для социального доказательства без лишних ПДн."""
    return (name or "Кто-то").strip().split(" ")[0] or "Кто-то"


@router.get("/recent", response_model=ActivityOut)
def recent(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Последние закрытые смены + срочные сегодня + сколько ищут сейчас.

    Все данные реальные и обезличенные (только имя). Это лента «здесь кипит
    жизнь» — главный крючок доверия и FOMO на входе в ленту."""
    items: list[ActivityItem] = []

    # Недавно закрытые смены (подтверждённые/завершённые) — «X получил Y ₽».
    closed = (
        db.query(Match, Vacancy, Employer, User)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .join(Employer, Match.employer_id == Employer.id)
        .join(User, Match.user_id == User.id)
        .filter(Match.status.in_(("confirmed", "completed")))
        .order_by(Match.created_at.desc())
        .limit(8)
        .all()
    )
    for m, v, emp, u in closed:
        pay = _shift_pay(v.rate, v.rate_type, v.start_time, v.end_time)
        items.append(ActivityItem(
            kind="closed",
            text=f"{_first_name(u.name)} вышел(ла) в «{emp.company_name}» — "
                 f"{pay:,} ₽".replace(",", " "),
            ago_min=_ago_min(m.created_at),
        ))

    # Срочные смены на сегодня — «горят прямо сейчас».
    today = datetime.now(UTC).date().isoformat()
    urgent_rows = (
        db.query(Vacancy, Employer)
        .join(Employer, Vacancy.employer_id == Employer.id)
        .filter(Vacancy.status == "active", Vacancy.date == today)
        .order_by(Vacancy.created_at.desc())
        .limit(5)
        .all()
    )
    for v, emp in urgent_rows:
        items.append(ActivityItem(
            kind="urgent",
            text=f"Срочно сегодня: смена в «{emp.company_name}»",
            ago_min=_ago_min(v.created_at),
        ))

    # Сколько ищут смену прямо сейчас — по свайпам за последний час.
    hour_ago = datetime.now(UTC) - timedelta(hours=1)
    searching = (
        db.query(Swipe.swiper_id)
        .filter(Swipe.created_at >= hour_ago)
        .distinct()
        .count()
    )
    # Если за час было пусто — показываем общее число соискателей (не ноль).
    if searching == 0:
        searching = db.query(User).filter(User.blocked.is_(False)).count()

    return ActivityOut(
        items=items,
        searching_now=searching,
        urgent_today=len(urgent_rows),
    )
