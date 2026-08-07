"""Общие помощники по правам/тарифам: план, boost-вакансии, баланс."""
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from .models import Boost, Entitlement, Subscription, Vacancy


def get_or_create(db: Session, owner_id: str) -> Entitlement:
    ent = db.get(Entitlement, owner_id)
    if ent is None:
        ent = Entitlement(owner_id=owner_id)
        db.add(ent)
        db.commit()
        db.refresh(ent)
    return ent


def plan_of(db: Session, owner_id: str) -> str:
    sub = (
        db.query(Subscription)
        .filter(Subscription.owner_id == owner_id)
        .first()
    )
    return sub.plan if sub and sub.active else "free"


def active_boost_vacancy_ids(db: Session) -> set[str]:
    """ID вакансий с не истёкшим boost."""
    now = datetime.now(UTC).isoformat()
    rows = db.query(Boost).filter(Boost.expires_at > now).all()
    return {b.vacancy_id for b in rows}


def active_vacancy_count(db: Session, employer_id: str) -> int:
    return (
        db.query(Vacancy)
        .filter(Vacancy.employer_id == employer_id, Vacancy.status == "active")
        .count()
    )


# Лимиты тарифа: число активных вакансий (None = безлимит).
# Модель — комиссия с закрытой смены, а не подписка. Значит нам ВЫГОДНО, чтобы
# заведение вешало как можно больше смен (больше смен → больше закрытых →
# больше комиссии). Поэтому лимита нет ни у кого — публикация бесплатна.
PLAN_VACANCY_LIMIT: dict[str, int | None] = {
    "free": None,
    "pro": None,
    "business": None,
}
