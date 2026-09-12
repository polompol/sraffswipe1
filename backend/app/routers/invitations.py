"""Исходящий интерес заведения и связанные с ним договорённости."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Match, Swipe, User, Vacancy
from ..security import current_principal
from ..timeutil import local_today
from .vacancies import taken_counts

router = APIRouter(prefix="/employer/invitations", tags=["employer"])


class InvitationMatchOut(BaseModel):
    id: str
    status: str
    role: str
    shift_date: str
    shift_start: int
    shift_end: int


class InvitationOut(BaseModel):
    id: str
    user_id: str
    name: str
    photo_url: str
    roles: list[str]
    invited_at: datetime
    status: str
    matches_count: int
    latest_match: InvitationMatchOut | None = None


class InvitationPage(BaseModel):
    items: list[InvitationOut]
    next_offset: int | None
    total: int


@router.get("", response_model=InvitationPage)
def invitations(
    view: Literal["all", "waiting", "with_matches"] = "all",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    if principal["role"] != "employer":
        raise HTTPException(403, "Только для работодателя")
    me = principal["id"]
    has_match = (
        db.query(Match.id)
        .filter(
            Match.employer_id == me,
            Match.user_id == Swipe.target_id,
        )
        .exists()
    )
    q = (
        db.query(Swipe, User)
        .join(User, User.id == Swipe.target_id)
        .filter(
            Swipe.swiper_id == me,
            Swipe.target_type == "user",
            Swipe.direction == "like",
        )
    )
    if view == "waiting":
        q = q.filter(~has_match)
    elif view == "with_matches":
        q = q.filter(has_match)
    total = q.count()
    rows = (
        q.order_by(Swipe.created_at.desc(), Swipe.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    ids = [u.id for _, u in rows]
    counts = (
        dict(
            db.query(Match.user_id, func.count(Match.id))
            .filter(
                Match.employer_id == me,
                Match.user_id.in_(ids),
            )
            .group_by(Match.user_id)
            .all()
        )
        if ids
        else {}
    )
    # Живая договорённость важнее завершённой, даже если её создали раньше.
    ranked = (
        db.query(
            Match.id,
            func.row_number()
            .over(
                partition_by=Match.user_id,
                order_by=(
                    case((Match.status.in_(("matched", "confirmed")), 0), else_=1),
                    Match.created_at.desc(),
                    Match.id.desc(),
                ),
            )
            .label("position"),
        )
        .filter(Match.employer_id == me, Match.user_id.in_(ids))
        .subquery()
    )
    latest = (
        {
            m.user_id: (m, v)
            for m, v in db.query(Match, Vacancy)
            .join(Vacancy, Vacancy.id == Match.vacancy_id)
            .join(ranked, ranked.c.id == Match.id)
            .filter(ranked.c.position == 1)
            .all()
        }
        if ids
        else {}
    )
    vacancies = [
        v
        for v in db.query(Vacancy)
        .filter(
            Vacancy.employer_id == me,
            Vacancy.status == "active",
        )
        .all()
        if v.date >= local_today(v.city)
    ]
    taken = taken_counts(db, [v.id for v in vacancies])
    has_open_shift = any(taken.get(v.id, 0) < v.headcount for v in vacancies)
    items = []
    for swipe, user in rows:
        pair = latest.get(user.id)
        match = pair[0] if pair else None
        vacancy = pair[1] if pair else None
        status = (
            match.status if match else "waiting" if has_open_shift else "no_open_shifts"
        )
        if match and match.no_show:
            status = "no_show"
        if user.blocked and not match:
            status = "unavailable"
        items.append(
            InvitationOut(
                id=swipe.id,
                user_id=user.id,
                name=user.name or "Соискатель",
                photo_url=user.photo_urls.split(",")[0],
                roles=[r for r in user.roles.split(",") if r],
                invited_at=swipe.created_at.replace(tzinfo=UTC),
                status=status,
                matches_count=counts.get(user.id, 0),
                latest_match=InvitationMatchOut(
                    id=match.id,
                    status=status,
                    role=vacancy.role,
                    shift_date=vacancy.date,
                    shift_start=vacancy.start_time,
                    shift_end=vacancy.end_time,
                )
                if match and vacancy
                else None,
            )
        )
    return InvitationPage(
        items=items,
        total=total,
        next_offset=offset + len(rows) if offset + len(rows) < total else None,
    )
