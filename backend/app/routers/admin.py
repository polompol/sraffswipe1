"""Админ-панель: контроль жалоб, подписок и ключевых метрик.

Доступ — только Telegram-id из ADMIN_TG_IDS. На пилоте этого достаточно вместо
полноценной back-office системы.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Employer,
    Match,
    Purchase,
    Report,
    Subscription,
    Swipe,
    User,
    Vacancy,
)
from ..security import current_principal
from .analytics import _is_admin

router = APIRouter(prefix="/admin", tags=["admin"])

_POSITIVE = ("like", "superlike")


def require_admin(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
) -> dict:
    if not _is_admin(db, principal):
        raise HTTPException(status_code=403, detail="Только для администратора")
    return principal


class Overview(BaseModel):
    users: int
    activeVacancies: int
    likes: int
    matches: int
    openReports: int
    activeSubscriptions: int


@router.get("/overview", response_model=Overview)
def overview(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    return Overview(
        users=db.query(func.count(User.id)).scalar() or 0,
        activeVacancies=db.query(func.count(Vacancy.id))
        .filter(Vacancy.status == "active")
        .scalar()
        or 0,
        likes=db.query(func.count(Swipe.id))
        .filter(Swipe.direction.in_(_POSITIVE))
        .scalar()
        or 0,
        matches=db.query(func.count(Match.id)).scalar() or 0,
        openReports=db.query(func.count(Report.id))
        .filter(Report.status == "open")
        .scalar()
        or 0,
        activeSubscriptions=db.query(func.count(Subscription.id))
        .filter(Subscription.active.is_(True))
        .scalar()
        or 0,
    )


class RevenueOut(BaseModel):
    activePro: int
    activeBusiness: int
    estMonthlyRub: int  # оценка дохода в месяц по активным подпискам
    totalPaidRub: int   # всего получено рублями (за всё время)
    totalStars: int     # всего получено Telegram Stars


# Месячные цены тарифов — для оценки регулярного дохода.
_PLAN_RUB = {"pro": 1990, "business": 4990}


@router.get("/revenue", response_model=RevenueOut)
def revenue(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    def _subs(plan: str) -> int:
        return (
            db.query(func.count(Subscription.id))
            .filter(Subscription.active.is_(True), Subscription.plan == plan)
            .scalar()
            or 0
        )

    def _sum(currency: str) -> int:
        return int(
            db.query(func.coalesce(func.sum(Purchase.amount), 0))
            .filter(Purchase.status == "paid", Purchase.currency == currency)
            .scalar()
            or 0
        )

    pro, business = _subs("pro"), _subs("business")
    return RevenueOut(
        activePro=pro,
        activeBusiness=business,
        estMonthlyRub=pro * _PLAN_RUB["pro"] + business * _PLAN_RUB["business"],
        totalPaidRub=_sum("RUB"),
        totalStars=_sum("XTR"),
    )


class ReportOut(BaseModel):
    id: str
    targetType: str
    targetId: str
    targetInfo: str  # что именно на разборе (название вакансии/имя/…)
    reason: str
    text: str
    status: str
    createdAt: str


def _describe_target(db: Session, target_type: str, target_id: str) -> str:
    """Человекочитаемое описание цели жалобы — чтобы админ видел контент."""
    if target_type == "vacancy":
        v = db.get(Vacancy, target_id)
        if v is None:
            return "вакансия удалена"
        emp = db.get(Employer, v.employer_id)
        return f"{v.role} · {emp.company_name if emp else '—'} · {v.rate}₽"
    if target_type == "user":
        u = db.get(User, target_id) or db.get(Employer, target_id)
        return getattr(u, "name", None) or getattr(u, "company_name", None) or "—"
    return "переписка по мэтчу"


@router.get("/reports", response_model=list[ReportOut])
def list_reports(
    status: str = "open",
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    q = db.query(Report)
    if status != "all":
        q = q.filter(Report.status == status)
    rows = q.order_by(Report.created_at.desc()).limit(100).all()
    return [
        ReportOut(
            id=r.id,
            targetType=r.target_type,
            targetId=r.target_id,
            targetInfo=_describe_target(db, r.target_type, r.target_id),
            reason=r.reason,
            text=r.text,
            status=r.status,
            createdAt=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/reports/{report_id}/resolve")
def resolve_report(
    report_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    rep = db.get(Report, report_id)
    if rep is None:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")
    rep.status = "reviewed"
    db.commit()
    return {"ok": True}


def _resolve_reports_for(db: Session, target_id: str) -> None:
    """Закрыть все открытые жалобы на эту цель."""
    for r in db.query(Report).filter(
        Report.target_id == target_id, Report.status == "open"
    ).all():
        r.status = "reviewed"


@router.post("/users/{user_id}/block")
def block_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Заблокировать соискателя или работодателя (бан мошенника)."""
    target = db.get(User, user_id) or db.get(Employer, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    target.blocked = True
    # Если это работодатель — снимаем и его вакансии.
    if isinstance(target, Employer):
        for v in db.query(Vacancy).filter(Vacancy.employer_id == user_id).all():
            v.status = "blocked"
    _resolve_reports_for(db, user_id)
    db.commit()
    return {"ok": True, "blocked": True}


@router.post("/vacancies/{vacancy_id}/block")
def block_vacancy(
    vacancy_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Снять вакансию (фейк/обман) — она исчезает из ленты."""
    v = db.get(Vacancy, vacancy_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    v.status = "blocked"
    _resolve_reports_for(db, vacancy_id)
    db.commit()
    return {"ok": True, "blocked": True}


@router.post("/users/{user_id}/unblock")
def unblock_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Снять блокировку с пользователя (отмена ошибочного бана)."""
    target = db.get(User, user_id) or db.get(Employer, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    target.blocked = False
    db.commit()
    return {"ok": True, "blocked": False}


@router.post("/vacancies/{vacancy_id}/unblock")
def unblock_vacancy(
    vacancy_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Вернуть вакансию в ленту."""
    v = db.get(Vacancy, vacancy_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    v.status = "active"
    db.commit()
    return {"ok": True, "blocked": False}


class BlockedOut(BaseModel):
    type: str  # user|employer|vacancy
    id: str
    info: str


@router.get("/blocked", response_model=list[BlockedOut])
def list_blocked(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    """Заблокированные пользователи и снятые вакансии — для разблокировки."""
    out: list[BlockedOut] = []
    for u in db.query(User).filter(User.blocked.is_(True)).limit(100).all():
        out.append(BlockedOut(type="user", id=u.id, info=u.name or "Соискатель"))
    for e in db.query(Employer).filter(Employer.blocked.is_(True)).limit(100).all():
        out.append(
            BlockedOut(type="user", id=e.id, info=e.company_name or "Заведение")
        )
    for v in db.query(Vacancy).filter(Vacancy.status == "blocked").limit(100).all():
        out.append(BlockedOut(type="vacancy", id=v.id, info=f"{v.role} · {v.rate}₽"))
    return out


class SubscriptionOut(BaseModel):
    ownerId: str
    company: str
    plan: str
    renewsAt: str | None = None


@router.get("/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    rows = (
        db.query(Subscription)
        .filter(Subscription.active.is_(True))
        .order_by(Subscription.created_at.desc())
        .limit(200)
        .all()
    )
    out: list[SubscriptionOut] = []
    for s in rows:
        emp = db.get(Employer, s.owner_id)
        out.append(SubscriptionOut(
            ownerId=s.owner_id,
            company=emp.company_name if emp else "—",
            plan=s.plan,
            renewsAt=s.renews_at,
        ))
    return out


@router.post("/subscriptions/{owner_id}/cancel")
def cancel_subscription(
    owner_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Отозвать подписку (после возврата денег в ЮKassa) — доступ падает на Free."""
    sub = (
        db.query(Subscription).filter(Subscription.owner_id == owner_id).first()
    )
    if sub is None:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    sub.active = False
    sub.plan = "free"
    db.commit()
    return {"ok": True, "plan": "free"}


class PurchaseOut(BaseModel):
    id: str
    ownerId: str
    sku: str
    provider: str
    amount: int
    currency: str
    status: str
    createdAt: str


@router.get("/purchases", response_model=list[PurchaseOut])
def list_purchases(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    """Журнал платежей — чтобы видеть, что и кому возвращать."""
    rows = (
        db.query(Purchase)
        .order_by(Purchase.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        PurchaseOut(
            id=p.id, ownerId=p.owner_id, sku=p.sku, provider=p.provider,
            amount=p.amount, currency=p.currency, status=p.status,
            createdAt=p.created_at.isoformat(),
        )
        for p in rows
    ]
