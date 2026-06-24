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
    streak: int = 0
    city: str = ""
    incomingLikes: int = 0  # «тебя хотят»: входящие лайки/отклики


def _streak(db: Session, owner_id: str) -> int:
    from ..models import Streak

    s = db.get(Streak, owner_id)
    return s.count if s else 0


def _incoming_likes(db: Session, principal: dict) -> int:
    """Сколько входящих лайков: соискателю — от заведений на него; заведению —
    отклики соискателей на его вакансии. Крючок «тебя хотят»."""
    from ..models import Swipe, Vacancy

    positive = ("like", "superlike")
    if principal["role"] == "employer":
        vac_ids = [
            v.id for v in db.query(Vacancy.id)
            .filter(Vacancy.employer_id == principal["id"]).all()
        ]
        if not vac_ids:
            return 0
        return (
            db.query(Swipe)
            .filter(
                Swipe.target_type == "vacancy",
                Swipe.target_id.in_(vac_ids),
                Swipe.direction.in_(positive),
            )
            .count()
        )
    return (
        db.query(Swipe)
        .filter(
            Swipe.target_type == "user",
            Swipe.target_id == principal["id"],
            Swipe.direction.in_(positive),
        )
        .count()
    )


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
            streak=_streak(db, e.id),
            incomingLikes=_incoming_likes(db, principal),
        )
    u = db.get(User, principal["id"])
    if u is None:
        raise HTTPException(status_code=404, detail="Не найдено")
    return MeOut(
        id=u.id, role="seeker", name=u.name or "Соискатель",
        rating=u.rating, tgUsername=u.tg_username,
        streak=_streak(db, u.id), city=u.city,
        incomingLikes=_incoming_likes(db, principal),
    )


def _age_from_iso(iso: str) -> int | None:
    """Возраст по дате рождения ISO (yyyy-mm-dd) или None при пустом/битом."""
    try:
        from datetime import date

        d = date.fromisoformat(iso)
    except (ValueError, TypeError):
        return None
    today = date.today()
    return today.year - d.year - (
        (today.month, today.day) < (d.month, d.day)
    )


class MeUpdateIn(BaseModel):
    name: str | None = None
    birth_date: str | None = None  # ISO yyyy-mm-dd
    city: str | None = None
    district: str | None = None
    roles: list[str] | None = None
    med_book: str | None = None
    self_employed: bool | None = None
    inn: str | None = None
    about: str | None = None
    photo_url: str | None = None
    company_name: str | None = None


@router.put("/me", response_model=MeOut)
def update_me(
    body: MeUpdateIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    # Возрастной ценз 18+ проверяется на сервере (не только в UI).
    if body.birth_date:
        age = _age_from_iso(body.birth_date)
        if age is None:
            raise HTTPException(status_code=422, detail="Некорректная дата рождения")
        if age < 18:
            raise HTTPException(
                status_code=422, detail="Сервис доступен только с 18 лет"
            )

    if principal["role"] == "employer":
        e = db.get(Employer, principal["id"])
        if e is None:
            raise HTTPException(status_code=404, detail="Не найдено")
        if body.company_name is not None:
            e.company_name = body.company_name
        if body.inn is not None:
            e.inn = body.inn
        db.commit()
        return MeOut(
            id=e.id, role="employer", name=e.company_name,
            rating=e.rating, tgUsername=e.tg_username,
            streak=_streak(db, e.id),
        )

    u = db.get(User, principal["id"])
    if u is None:
        raise HTTPException(status_code=404, detail="Не найдено")
    if body.name is not None:
        u.name = body.name
    if body.birth_date is not None:
        u.birth_date = body.birth_date
    if body.city is not None:
        u.city = body.city
    if body.district is not None:
        u.district = body.district
    if body.roles is not None:
        u.roles = ",".join(body.roles)
    if body.med_book is not None:
        u.med_book = body.med_book
    if body.self_employed is not None:
        u.self_employed = body.self_employed
    if body.inn is not None:
        u.inn = body.inn
    if body.about is not None:
        u.about = body.about
    if body.photo_url is not None:
        u.photo_urls = body.photo_url
    db.commit()
    return MeOut(
        id=u.id, role="seeker", name=u.name or "Соискатель",
        rating=u.rating, tgUsername=u.tg_username,
        streak=_streak(db, u.id), city=u.city,
    )
