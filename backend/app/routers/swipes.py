"""Свайпы и детект мэтча."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Match, Message, Swipe, Vacancy
from ..schemas import SwipeIn, SwipeOut
from ..security import current_principal

router = APIRouter(prefix="/swipes", tags=["swipes"])

_POSITIVE = {"like", "superlike"}


def _ensure_match(
    db: Session, user_id: str, employer_id: str, vacancy_id: str
) -> Match:
    existing = (
        db.query(Match)
        .filter(Match.vacancy_id == vacancy_id, Match.user_id == user_id)
        .first()
    )
    if existing:
        return existing
    match = Match(
        user_id=user_id, employer_id=employer_id, vacancy_id=vacancy_id
    )
    db.add(match)
    db.flush()
    db.add(
        Message(
            match_id=match.id,
            sender_id="system",
            text="Это мэтч! Договоритесь о деталях смены.",
            is_system=True,
        )
    )
    db.commit()
    db.refresh(match)
    return match


@router.post("", response_model=SwipeOut)
def swipe(
    body: SwipeIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    me = principal["id"]
    db.add(
        Swipe(
            swiper_id=me,
            target_id=body.target_id,
            target_type=body.target_type,
            direction=body.direction,
        )
    )
    db.commit()

    if body.direction not in _POSITIVE:
        return SwipeOut(recorded=True, matched=False)

    # Соискатель лайкнул вакансию → ищем встречный лайк работодателя на него.
    if principal["role"] == "seeker" and body.target_type == "vacancy":
        vac = db.get(Vacancy, body.target_id)
        if vac is None:
            raise HTTPException(status_code=404, detail="Вакансия не найдена")
        reciprocal = (
            db.query(Swipe)
            .filter(
                Swipe.swiper_id == vac.employer_id,
                Swipe.target_id == me,
                Swipe.target_type == "user",
                Swipe.direction.in_(_POSITIVE),
            )
            .first()
        )
        if reciprocal:
            match = _ensure_match(db, me, vac.employer_id, vac.id)
            return SwipeOut(recorded=True, matched=True, match_id=match.id)

    # Работодатель лайкнул кандидата → ищем его лайк на любую нашу вакансию.
    if principal["role"] == "employer" and body.target_type == "user":
        my_vacs = [
            v.id
            for v in db.query(Vacancy)
            .filter(Vacancy.employer_id == me)
            .all()
        ]
        seeker_like = (
            db.query(Swipe)
            .filter(
                Swipe.swiper_id == body.target_id,
                Swipe.target_type == "vacancy",
                Swipe.target_id.in_(my_vacs or ["__none__"]),
                Swipe.direction.in_(_POSITIVE),
            )
            .first()
        )
        if seeker_like:
            match = _ensure_match(
                db, body.target_id, me, seeker_like.target_id
            )
            return SwipeOut(recorded=True, matched=True, match_id=match.id)

    return SwipeOut(recorded=True, matched=False)
