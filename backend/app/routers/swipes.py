"""Свайпы и детект мэтча."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..entitlements import get_or_create
from ..models import Entitlement, Match, Message, Swipe, User, Vacancy
from ..notify import notify_owner
from ..ratelimit import rate_limit
from ..schemas import SwipeIn, SwipeOut
from ..security import current_principal

router = APIRouter(prefix="/swipes", tags=["swipes"])

_POSITIVE = {"like", "superlike"}


def _ensure_match(
    db: Session, user_id: str, employer_id: str, vacancy_id: str
) -> tuple[Match, bool]:
    existing = (
        db.query(Match)
        .filter(Match.vacancy_id == vacancy_id, Match.user_id == user_id)
        .first()
    )
    if existing:
        return existing, False
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
    try:
        db.commit()
    except IntegrityError:
        # Гонка встречных свайпов — мэтч уже создан параллельно, берём его.
        db.rollback()
        existing = (
            db.query(Match)
            .filter(Match.vacancy_id == vacancy_id, Match.user_id == user_id)
            .first()
        )
        if existing:
            return existing, False
        raise
    db.refresh(match)
    return match, True


def _on_match(db: Session, match: Match, created: bool) -> None:
    if not created:
        return
    notify_owner(db, match.user_id, "🔥 У вас новый мэтч в StaffSwipe!")
    notify_owner(db, match.employer_id, "🔥 Новый отклик-мэтч в StaffSwipe!")


@router.post(
    "",
    response_model=SwipeOut,
    dependencies=[Depends(rate_limit("swipe", 60, 60))],
)
def swipe(
    body: SwipeIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    me = principal["id"]

    # Сначала валидируем цель — чтобы при 404 не «сжечь» супер-лайк/не писать свайп.
    if body.target_type == "vacancy":
        if db.get(Vacancy, body.target_id) is None:
            raise HTTPException(status_code=404, detail="Вакансия не найдена")
    elif body.target_type == "user":
        if db.get(User, body.target_id) is None:
            raise HTTPException(status_code=404, detail="Кандидат не найден")

    # Идемпотентность: повторный свайп по той же цели не списывает баланс
    # повторно и не плодит дубль-записи (защита от двойного клика/ретрая).
    existing = (
        db.query(Swipe)
        .filter(
            Swipe.swiper_id == me,
            Swipe.target_id == body.target_id,
            Swipe.target_type == body.target_type,
        )
        .first()
    )

    if existing is None:
        # Супер-лайк «Срочно» — платная фича: списываем с баланса атомарно
        # (UPDATE ... WHERE balance >= 1), иначе параллельные запросы на разные
        # цели уводят баланс в минус (double-spend).
        if body.direction == "superlike":
            get_or_create(db, me)  # гарантируем строку прав
            spent = (
                db.query(Entitlement)
                .filter(
                    Entitlement.owner_id == me,
                    Entitlement.superlike_balance >= 1,
                )
                .update(
                    {Entitlement.superlike_balance: Entitlement.superlike_balance - 1},
                    synchronize_session=False,
                )
            )
            if not spent:
                raise HTTPException(
                    status_code=402,
                    detail="Закончились супер-лайки. Купите пакет «Срочно».",
                )

        db.add(
            Swipe(
                swiper_id=me,
                target_id=body.target_id,
                target_type=body.target_type,
                direction=body.direction,
            )
        )
        try:
            db.commit()
        except IntegrityError:
            # Гонка: параллельный запрос уже записал этот свайп — откатываем
            # списание баланса и считаем операцию идемпотентной.
            db.rollback()

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
            match, created = _ensure_match(db, me, vac.employer_id, vac.id)
            _on_match(db, match, created)
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
            match, created = _ensure_match(
                db, body.target_id, me, seeker_like.target_id
            )
            _on_match(db, match, created)
            return SwipeOut(recorded=True, matched=True, match_id=match.id)

    return SwipeOut(recorded=True, matched=False)
