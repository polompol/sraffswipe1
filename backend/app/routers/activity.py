"""Живая лента активности — социальное доказательство («тут кипит жизнь»)."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Match, Swipe, User, Vacancy
from ..security import current_principal
from ..timeutil import local_today

router = APIRouter(prefix="/activity", tags=["activity"])

# Русские названия должностей для витрины.
_ROLE_RU = {
    "waiter": "Официант", "waiter_assistant": "Помощник официанта",
    "barista": "Бариста", "cook": "Повар", "dishwasher": "Посудомойщик",
    "hostess": "Хостес", "bartender": "Бармен", "hookah": "Кальянщик",
    "florist": "Флорист", "administrator": "Администратор",
    "courier": "Курьер", "cleaner": "Уборщик",
}


def _role_ru(role: str) -> str:
    return _ROLE_RU.get(role, "Сотрудник")


class ActivityItem(BaseModel):
    kind: str  # closed|urgent
    text: str
    ago_min: int


class ActivityOut(BaseModel):
    items: list[ActivityItem]
    searching_now: int  # сколько людей ищут смену рядом сейчас
    urgent_today: int  # сколько срочных смен на сегодня




def _ago_min(then: datetime) -> int:
    if then.tzinfo is None:
        then = then.replace(tzinfo=UTC)
    delta = datetime.now(UTC) - then
    return max(0, int(delta.total_seconds() // 60))




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
    # Имя работника и название заведения в витрине больше не участвуют,
    # поэтому и не выбираем их: лишние персональные данные не должны даже
    # покидать базу.
    closed = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(Match.status.in_(("confirmed", "completed")))
        .order_by(Match.created_at.desc())
        .limit(8)
        .all()
    )
    for m, v in closed:
        items.append(ActivityItem(
            kind="closed",
            # Раньше здесь была связка «имя + заведение + сумма», видная
            # ЛЮБОМУ вошедшему. На пилоте, где все друг друга знают, это
            # выдавало занятость конкретного человека и ставки конкретного
            # заведения. Смысл витрины — показать, что сервис живой; для
            # этого хватает роли и района.
            text=f"{_role_ru(v.role)} вышел(ла) на смену"
                 + (f" · {v.city}" if v.city else ""),
            ago_min=_ago_min(m.created_at),
        ))

    # Срочные смены на сегодня — «горят прямо сейчас».
    today = local_today()
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
