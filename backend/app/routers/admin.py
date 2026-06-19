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


class ReportOut(BaseModel):
    id: str
    targetType: str
    targetId: str
    reason: str
    text: str
    status: str
    createdAt: str


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
