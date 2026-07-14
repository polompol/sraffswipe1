"""Социальные фичи: рефералы, отзывы/рейтинг, профиль текущего пользователя."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Employer, Match, Referral, Review, User, Vacancy
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
    stars: Annotated[int, Field(ge=1, le=5)]
    text: Annotated[str, StringConstraints(max_length=1000)] = ""


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
    # Отзыв — только за фактически состоявшуюся смену (обе стороны отметились),
    # а не за «согласились выйти» (confirmed). Иначе рейтинг накручивается
    # сговором «работник + фейковое заведение» без единой реальной смены.
    if match.status != "completed":
        raise HTTPException(status_code=400, detail="Смена ещё не закрыта")
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
    district: str = ""
    incomingLikes: int = 0  # «тебя хотят»: входящие лайки/отклики
    earnedRub: int = 0  # заработано через сервис (мотивация доходом)
    shiftsDone: int = 0  # сколько смен закрыто
    availableToday: bool = False  # «Готов выйти сегодня» (только соискатель)
    profileCompletion: int = 100  # % заполненности анкеты соискателя
    # Поля для предзаполнения экрана редактирования (свои данные, не публичные).
    birthDate: str = ""
    roles: list[str] = []
    selfEmployed: bool = False
    inn: str | None = None
    about: str = ""
    experienceTags: list[str] = []
    photoUrl: str = ""


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


def _shift_pay(rate: int, rate_type: str, start: int, end: int) -> int:
    """Сколько стоит одна смена. Зеркало estimatedPay в TMA (lib/format.ts)."""
    if rate_type == "perShift":
        return rate
    mins = end - start
    if mins <= 0:
        mins += 1440  # ночная смена через полночь
    return round(rate * mins / 60)


def _earnings(db: Session, role: str, owner_id: str) -> tuple[int, int]:
    """(сколько смен закрыто, сколько заработано ₽).

    Считаем ТОЛЬКО по закрытым смёнам (completed = взаимно подтверждены). За
    confirmed (только согласились) не начисляем — иначе «заработок» и счётчик
    смен накручивались бы фиктивными мэтчами без реального выхода."""
    col = Match.employer_id if role == "employer" else Match.user_id
    rows = (
        db.query(Vacancy.rate, Vacancy.rate_type, Vacancy.start_time, Vacancy.end_time)
        .join(Match, Match.vacancy_id == Vacancy.id)
        .filter(col == owner_id, Match.status == "completed")
        .all()
    )
    shifts = len(rows)
    if role == "employer":
        return shifts, 0
    earned = sum(_shift_pay(r, rt, s, e) for r, rt, s, e in rows)
    return shifts, earned


def _profile_completion(u) -> int:
    """% заполненности анкеты — ключевые поля, что влияют на мэтчи."""
    fields = [
        bool(u.birth_date),
        bool(u.city),
        bool(u.roles),
        bool(u.photo_urls),
        bool(u.about),
    ]
    return round(sum(fields) / len(fields) * 100)


@router.get("/me", response_model=MeOut)
def me(
    principal: dict = Depends(current_principal), db: Session = Depends(get_db)
):
    if principal["role"] == "employer":
        e = db.get(Employer, principal["id"])
        if e is None:
            raise HTTPException(status_code=404, detail="Не найдено")
        shifts, _ = _earnings(db, "employer", e.id)
        return MeOut(
            id=e.id, role="employer", name=e.company_name,
            rating=e.rating, tgUsername=e.tg_username,
            streak=_streak(db, e.id),
            incomingLikes=_incoming_likes(db, principal),
            shiftsDone=shifts,
        )
    u = db.get(User, principal["id"])
    if u is None:
        raise HTTPException(status_code=404, detail="Не найдено")
    shifts, earned = _earnings(db, "seeker", u.id)
    roles = [r for r in (u.roles or "").split(",") if r]
    exp = [t for t in (u.experience_tags or "").split(",") if t]
    photos = [p for p in (u.photo_urls or "").split(",") if p]
    return MeOut(
        id=u.id, role="seeker", name=u.name or "Соискатель",
        rating=u.rating, tgUsername=u.tg_username,
        streak=_streak(db, u.id), city=u.city, district=u.district,
        incomingLikes=_incoming_likes(db, principal),
        earnedRub=earned, shiftsDone=shifts,
        availableToday=u.available_today,
        profileCompletion=_profile_completion(u),
        birthDate=u.birth_date or "", roles=roles,
        selfEmployed=u.self_employed, inn=u.inn,
        about=u.about or "", experienceTags=exp,
        photoUrl=photos[0] if photos else "",
    )


class AvailableIn(BaseModel):
    available: bool


@router.post("/me/available")
def set_available(
    body: AvailableIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """«Готов выйти сегодня» — тумблер доступности соискателя."""
    if principal["role"] != "seeker":
        raise HTTPException(status_code=403, detail="Только для соискателя")
    u = db.get(User, principal["id"])
    if u is None:
        raise HTTPException(status_code=404, detail="Не найдено")
    u.available_today = body.available
    db.commit()
    return {"availableToday": u.available_today}


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
    # Лимиты длины — анти-абуз: без них можно записать мегабайтные строки в
    # имя/«о себе» и раздуть БД.
    name: Annotated[str, StringConstraints(max_length=80)] | None = None
    birth_date: Annotated[
        str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")
    ] | None = None
    city: Annotated[str, StringConstraints(max_length=80)] | None = None
    district: Annotated[str, StringConstraints(max_length=80)] | None = None
    roles: Annotated[list[str], Field(max_length=12)] | None = None
    med_book: Literal["yes", "no", "expired"] | None = None
    self_employed: bool | None = None
    inn: Annotated[
        str, StringConstraints(pattern=r"^\d{10,12}$")
    ] | None = None
    about: Annotated[str, StringConstraints(max_length=1000)] | None = None
    experience_tags: Annotated[list[str], Field(max_length=12)] | None = None
    photo_url: Annotated[str, StringConstraints(max_length=500)] | None = None
    company_name: Annotated[str, StringConstraints(max_length=120)] | None = None


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
        # Правка названия/ИНН вручную СБРАСЫВАЕТ бейдж «Проверен»: верификация
        # подтверждала конкретные данные из DaData. Иначе можно было бы
        # подтвердиться, а потом переписать имя на чужой бренд с бейджем.
        changed_identity = (
            (body.company_name is not None and body.company_name != e.company_name)
            or (body.inn is not None and body.inn != e.inn)
        )
        if body.company_name is not None:
            e.company_name = body.company_name
        if body.inn is not None:
            e.inn = body.inn
        if changed_identity and e.verified:
            e.verified = False
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
    if body.experience_tags is not None:
        u.experience_tags = ",".join(body.experience_tags)
    if body.photo_url is not None:
        u.photo_urls = body.photo_url
    db.commit()
    return MeOut(
        id=u.id, role="seeker", name=u.name or "Соискатель",
        rating=u.rating, tgUsername=u.tg_username,
        streak=_streak(db, u.id), city=u.city,
    )
