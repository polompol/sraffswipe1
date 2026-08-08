"""Общие помощники по правам/тарифам: план, баланс, лимиты."""
from sqlalchemy.orm import Session

from .models import Entitlement, Subscription, Vacancy


def ensure(db: Session, owner_id: str) -> Entitlement:
    """Гарантировать строку прав БЕЗ коммита.

    Отдельно от get_or_create, потому что коммит в середине денежной операции
    фиксирует всё, что висит в сессии, — и разрывает её на две части. Именно
    так терялись пополнения: запись «оплачено» успевала зафиксироваться, а
    зачисление на баланс — нет. Здесь только flush: строка появляется в
    транзакции, но фиксируется вместе со всем остальным.
    """
    ent = db.get(Entitlement, owner_id)
    if ent is None:
        ent = Entitlement(owner_id=owner_id)
        db.add(ent)
        db.flush()
    return ent


def get_or_create(db: Session, owner_id: str) -> Entitlement:
    """То же, но с коммитом. Для обычных чтений, вне денежных транзакций."""
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
