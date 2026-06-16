"""Социальные фичи: рефералы, отзывы/рейтинг, профиль текущего пользователя."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Employer, Match, Referral, Review, User
from ..security import current_principal

router = APIRouter(tags=["social"])


# ---- Рефералы ----


class ReferralOut(BaseModel):
    code: str
    link: str
    invited: int
    bonusSuperlikes: int


@router.get("/referral/me", response_model=ReferralOut)
def referral_me(
    principal: dict = Depends(current_principal), db: Session = Depends(get_db)
):
    me = principal["id"]
    code = f"ref_{me}"
    invited = db.query(Referral).filter(Referral.referrer_id == me).count()
    return ReferralOut(
        code=code,
        link=f"https://t.me/{settings.bot_username}?startapp={code}",
        invited=invited,
        bonusSuperlikes=settings.referral_bonus_superlikes,
    )


# ---- Отзывы / рейтинг ----


class ReviewIn(BaseModel):
    stars: int
    text: str = ""


def _recompute_rating(db: Session, ratee_id: str) -> float:
    avg = (
        db.query(func.avg(Review.stars))
        .filter(Review.ratee_id == ratee_id)
        .scalar()
    )
    rating = round(float(avg), 1) if avg is not None else 0.0
    target = db.get(User, ratee_id) or db.get(Employer, ratee_id)
    if target is not None:
        target.rating = rating
        db.commit()
    return rating


@router.post("/matches/{match_id}/review")
def leave_review(
    match_id: str,
    body: ReviewIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    if not 1 <= body.stars <= 5:
        raise HTTPException(status_code=400, detail="Оценка 1..5")
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    me = principal["id"]
    if me not in (match.user_id, match.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа")
    if match.status not in ("confirmed", "completed"):
        raise HTTPException(status_code=400, detail="Смена ещё не подтверждена")
    if db.query(Review).filter(
        Review.match_id == match_id, Review.rater_id == me
    ).first():
        raise HTTPException(status_code=409, detail="Отзыв уже оставлен")

    ratee = match.employer_id if me == match.user_id else match.user_id
    db.add(Review(
        match_id=match_id, rater_id=me, ratee_id=ratee,
        stars=body.stars, text=body.text,
    ))
    db.commit()
    rating = _recompute_rating(db, ratee)
    return {"ok": True, "rateeRating": rating}


# ---- Профиль текущего пользователя ----


class MeOut(BaseModel):
    id: str
    role: str
    name: str
    rating: float
    tgUsername: str | None = None


@router.get("/me", response_model=MeOut)
def me(
    principal: dict = Depends(current_principal), db: Session = Depends(get_db)
):
    if principal["role"] == "employer":
        e = db.get(Employer, principal["id"])
        if e is None:
            raise HTTPException(status_code=404, detail="Не найдено")
        return MeOut(
            id=e.id, role="employer", name=e.company_name,
            rating=e.rating, tgUsername=e.tg_username,
        )
    u = db.get(User, principal["id"])
    if u is None:
        raise HTTPException(status_code=404, detail="Не найдено")
    return MeOut(
        id=u.id, role="seeker", name=u.name or "Соискатель",
        rating=u.rating, tgUsername=u.tg_username,
    )
