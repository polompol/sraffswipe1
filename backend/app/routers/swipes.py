"""Свайпы и детект мэтча."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employer, Match, Message, Swipe, User, Vacancy
from ..notify import notify_owner
from ..ratelimit import rate_limit
from ..schemas import SwipeIn, SwipeOut
from ..security import current_principal
from .billing import commission_overdue

router = APIRouter(prefix="/swipes", tags=["swipes"])

_POSITIVE = {"like"}


def _same_person(db: Session, user_id: str, employer_id: str) -> bool:
    """Соискатель и заведение — один человек (совпадает Telegram-id)?
    Само-мэтч даёт накрутку рейтинга/истории/комиссии сговором с самим собой.
    tg_id=0 — dev/insecure-заглушка (в проде реальных нулевых id нет), её не
    считаем совпадением, иначе сломались бы локальные тесты."""
    u = db.get(User, user_id)
    e = db.get(Employer, employer_id)
    if u is None or e is None:
        return False
    return bool(u.tg_id and e.tg_id and u.tg_id == e.tg_id)


class SlotsFull(Exception):
    """Мест на смене больше нет."""


def _claim_slot(db: Session, vacancy_id: str) -> None:
    """Занять место на смене или отказать, если все разобрали.

    Свободные места при создании мэтча не проверялись ВООБЩЕ. Смена на одного
    уходила из ленты, когда место занимали, — но два человека могли успеть
    откликнуться до этого, и заведение, лайкнув обоих, получало два мэтча на
    одно место. Оба уверены, что смена их; один приезжает зря, а комиссия
    начисляется за каждого закрытого.

    Строку смены берём под блокировку (FOR UPDATE), потом считаем занятые
    места. Без блокировки два параллельных запроса оба увидели бы «место
    свободно» и оба создали бы мэтч. На SQLite блокировка строки не
    поддерживается, но там запись и так идёт по одному writer'у.
    """
    q = db.query(Vacancy).filter(Vacancy.id == vacancy_id)
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        q = q.with_for_update()
    vac = q.first()
    if vac is None:
        raise SlotsFull
    taken = (
        db.query(func.count(Match.id))
        .filter(
            Match.vacancy_id == vacancy_id,
            Match.status.in_(("matched", "confirmed", "completed")),
            Match.no_show.is_(False),
        )
        .scalar()
    ) or 0
    if taken >= (vac.headcount or 1):
        raise SlotsFull


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
    _claim_slot(db, vacancy_id)
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
    notify_owner(
        db, match.employer_id,
        "Новый мэтч в StaffSwipe — договоритесь о деталях смены.",
        open_app="Открыть чат", screen="matches",
    )


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

    # Роль ↔ цель: работник свайпает вакансии, заведение — кандидатов. Иначе
    # можно было бы накрутить чужой счётчик «тебя хотят» лайком не по своей роли.
    expected = "vacancy" if principal["role"] == "seeker" else "user"
    if body.target_type != expected:
        raise HTTPException(status_code=400, detail="Некорректная цель свайпа")

    # Просроченный долг по комиссии: заведение не может звать НОВЫХ людей
    # (позитивный свайп) — иначе блок публикации обходится старыми вакансиями,
    # а долг растёт. Дизлайки и уже начатые смены работают.
    if (
        principal["role"] == "employer"
        and body.direction in _POSITIVE
        and commission_overdue(db, me)
    ):
        raise HTTPException(
            status_code=402,
            detail="Есть просроченная комиссия — оплатите счёт, "
                   "чтобы приглашать новых людей.",
        )

    # Сначала валидируем цель — чтобы при 404 не писать свайп в никуда.
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
        if reciprocal and not _same_person(db, me, vac.employer_id):
            try:
                match, created = _ensure_match(db, me, vac.employer_id, vac.id)
            except SlotsFull:
                # Отклик записан — человек не виноват, что опоздал на секунды.
                # Но мэтча нет: мест не осталось.
                return SwipeOut(recorded=True, matched=False)
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
        if seeker_like and not _same_person(db, body.target_id, me):
            try:
                match, created = _ensure_match(
                    db, body.target_id, me, seeker_like.target_id
                )
            except SlotsFull:
                # Заведение уже набрало всех на эту смену. Отказ понятный:
                # иначе оно бы думало, что позвало человека, а мэтча нет.
                raise HTTPException(
                    status_code=409,
                    detail="На эту смену уже набраны все люди. "
                           "Увеличьте число мест или опубликуйте новую смену.",
                ) from None
            _on_match(db, match, created)
            return SwipeOut(recorded=True, matched=True, match_id=match.id)

    return SwipeOut(recorded=True, matched=False)
