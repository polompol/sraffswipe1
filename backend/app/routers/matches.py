"""Мэтчи и подтверждение смены."""
import secrets
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StringConstraints
from sqlalchemy.orm import Session

from ..config import settings
from ..conflicts import overlapping_shifts
from ..db import get_db
from ..geo import distance_km
from ..models import (
    Commission,
    Entitlement,
    Match,
    Message,
    Report,
    Vacancy,
    WalletTxn,
)
from ..notify import notify_admins, notify_owner
from ..ratelimit import rate_limit
from ..schemas import MatchOut
from ..security import current_principal, secure_equals
from ..timeutil import shift_start_utc
from .analytics import _is_admin

router = APIRouter(prefix="/matches", tags=["matches"])

# Радиус, в пределах которого гео-отметка «я на смене» считается валидной.
_CHECKIN_RADIUS_KM = 0.3


class AttendanceIn(BaseModel):
    attended: bool


class CheckinIn(BaseModel):
    # Помощники для отметки работника: код от заведения ИЛИ геолокация на месте.
    code: str | None = None
    lat: float | None = None
    lng: float | None = None


class DisputeIn(BaseModel):
    note: str = ""


def _sys(db: Session, match_id: str, text: str) -> None:
    db.add(Message(match_id=match_id, sender_id="system", text=text, is_system=True))


def _fmt_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _fmt_date(iso: str) -> str:
    """2026-08-09 → 9 августа: в предупреждении человек должен узнать смену."""
    months = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля",
              "августа", "сентября", "октября", "ноября", "декабря")
    try:
        y, mth, d = (int(x) for x in iso.split("-"))
        return f"{d} {months[mth - 1]}"
    except (ValueError, IndexError):
        return iso


def _shift_pay(v: Vacancy) -> int:
    """Оплата смены, ₽ (зеркало estimatedPay в TMA)."""
    if v.rate_type == "perShift":
        return v.rate
    mins = v.end_time - v.start_time
    if mins <= 0:
        mins += 1440  # ночная смена через полночь
    return round(v.rate * mins / 60)


def _accrue_commission(db: Session, m: Match) -> None:
    """Начисляем комиссию за закрытую смену. Идемпотентно — по одной записи
    на смену. Если у заведения есть денежный баланс (аванс) — списываем сразу;
    иначе комиссия висит pending и попадает в недельный счёт."""
    if settings.commission_pct <= 0:
        return
    if db.query(Commission).filter(Commission.match_id == m.id).first():
        return
    v = db.get(Vacancy, m.vacancy_id)
    if v is None:
        return
    pay = _shift_pay(v)
    # Округляем половину ВВЕРХ, а не «к чётному», как делает round(): при
    # комиссии 282.5 ₽ он давал 282, а при 283.5 — 284. Объяснить заведению
    # такую логику невозможно, а копейки в бухгалтерии всплывают.
    fee = int(
        (Decimal(pay) * settings.commission_pct / 100).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    amount = max(settings.commission_min_rub, fee)
    c = Commission(
        employer_id=m.employer_id, match_id=m.id, shift_pay=pay, amount=amount,
    )
    # Атомарный UPDATE с условием «хватает денег» — двойное списание при
    # гонке невозможно.
    paid = (
        db.query(Entitlement)
        .filter(
            Entitlement.owner_id == m.employer_id,
            Entitlement.balance_rub >= amount,
        )
        .update(
            {Entitlement.balance_rub: Entitlement.balance_rub - amount},
            synchronize_session=False,
        )
    )
    if paid:
        c.status = "paid"
        db.add(WalletTxn(
            owner_id=m.employer_id, amount=-amount, kind="commission",
            note=f"Комиссия за смену {m.id[:8]}",
        ))
        _sys(db, m.id, f"Комиссия {amount} ₽ списана с баланса заведения ✓")
    db.add(c)


def _maybe_complete(db: Session, m: Match) -> None:
    """Смена закрывается ТОЛЬКО при взаимном подтверждении обеих сторон."""
    if (
        m.status == "confirmed"
        and m.seeker_checked_in
        and m.employer_checked_in
        and not m.disputed
    ):
        m.status = "completed"
        m.no_show = False
        _accrue_commission(db, m)
        _sys(db, m.id, "Обе стороны подтвердили выход ✓ Смена закрыта.")


@router.post(
    "/{match_id}/attendance",
    dependencies=[Depends(rate_limit("attendance", 30, 60))],
)
def mark_attendance(
    match_id: str,
    body: AttendanceIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Заведение подтверждает выход. `attended=true` — «человек пришёл» (сторона
    заведения во взаимном подтверждении). `attended=false` — «не вышел»: если
    работник уже отметился, это КОНФЛИКТ → спор оператору; иначе — неявка."""
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["role"] != "employer" or principal["id"] != m.employer_id:
        raise HTTPException(status_code=403, detail="Только работодатель смены")
    # Уже закрытую смену не трогаем: иначе attended=false переоткрывал бы спор
    # по completed-смене и спамил оператора ложными уведомлениями.
    if m.status != "confirmed":
        raise HTTPException(status_code=400, detail="Смена не в статусе подтверждённой")

    if body.attended:
        m.employer_checked_in = True
        m.no_show = False
        _maybe_complete(db, m)
    elif m.seeker_checked_in:
        # Работник говорит «был», заведение — «не вышел». Не решаем сами.
        m.disputed = True
        notify_admins(f"⚠️ Спор по смене {m.id[:8]}: работник отметился, "
                      f"заведение говорит «не вышел». Разберите в админ-панели.")
        _sys(db, m.id, "Спор по выходу — разбирает оператор StaffSwipe.")
    else:
        m.no_show = True  # согласованная неявка
    db.commit()
    return {"ok": True, "noShow": m.no_show, "disputed": m.disputed}


def _to_out(
    db: Session, m: Match, role: str = "", vac: Vacancy | None = None
) -> MatchOut:
    # Код прихода показываем ТОЛЬКО заведению как помощник, пока смена не закрыта.
    show_code = role == "employer" and m.status == "confirmed" and bool(m.checkin_code)
    # vac передают заранее, когда мэтчей много: иначе на каждую строку списка
    # уходил отдельный запрос за сменой (25 мэтчей = 27 запросов).
    v = vac if vac is not None else db.get(Vacancy, m.vacancy_id)
    pay = _shift_pay(v) if v is not None else 0
    return MatchOut(
        id=m.id,
        user_id=m.user_id,
        employer_id=m.employer_id,
        vacancy_id=m.vacancy_id,
        status=m.status,
        confirmed_by_seeker=m.confirmed_by_seeker,
        confirmed_by_employer=m.confirmed_by_employer,
        checkin_code=m.checkin_code if show_code else None,
        checked_in=m.status == "completed",
        seeker_checked_in=m.seeker_checked_in,
        employer_checked_in=m.employer_checked_in,
        shift_pay=pay,
        disputed=m.disputed,
    )


@router.get("", response_model=list[MatchOut])
def list_matches(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    col = Match.user_id if principal["role"] == "seeker" else Match.employer_id
    rows = db.query(Match).filter(col == principal["id"]).all()
    # Смены подгружаем ОДНИМ запросом на весь список, а не по одному на строку.
    vacs = {
        v.id: v
        for v in db.query(Vacancy).filter(
            Vacancy.id.in_([m.vacancy_id for m in rows] or ["__none__"])
        )
    }
    return [
        _to_out(db, m, principal["role"], vac=vacs.get(m.vacancy_id))
        for m in rows
    ]


@router.post(
    "/{match_id}/checkin",
    response_model=MatchOut,
    # Анти-перебор: 6-значный код нельзя подобрать скриптом —
    # максимум 5 попыток в минуту на пользователя.
    dependencies=[Depends(rate_limit("checkin", 5, 60))],
)
def checkin(
    match_id: str,
    body: CheckinIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Сторона работника во взаимном подтверждении: «я на смене». Подтверждается
    помощниками (код заведения ИЛИ геолокация на месте). Смена закрывается лишь
    когда заведение тоже подтвердит. Не может отметиться → кнопка «Проблема»."""
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["role"] != "seeker" or principal["id"] != m.user_id:
        raise HTTPException(status_code=403, detail="Отметиться может только работник")
    if m.status != "confirmed":
        raise HTTPException(status_code=400, detail="Смена не подтверждена")

    by_code = bool(
        body.code
        and m.checkin_code
        and secure_equals(body.code.strip(), m.checkin_code)
    )
    by_geo = False
    if body.lat is not None and body.lng is not None:
        v = db.get(Vacancy, m.vacancy_id)
        if v is not None and (v.lat or v.lng):
            by_geo = distance_km(body.lat, body.lng, v.lat, v.lng) <= _CHECKIN_RADIUS_KM
    if not (by_code or by_geo):
        raise HTTPException(
            status_code=400,
            detail="Не удалось отметиться: неверный код или вы не на месте смены",
        )
    m.seeker_checked_in = True
    # Способ важен: код знает только заведение, поэтому по нему смену можно
    # закрыть автоматически, если заведение молчит. По гео — нельзя.
    if by_code:
        m.checkin_by_code = True
    _sys(db, m.id, "Работник отметился: на месте. Ждём подтверждения заведения.")
    _maybe_complete(db, m)
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])


@router.post(
    "/{match_id}/dispute",
    response_model=MatchOut,
    dependencies=[Depends(rate_limit("dispute", 5, 300))],  # анти-спам
)
def dispute(
    match_id: str,
    body: DisputeIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """«Пришёл/был, но не могу подтвердить» — эскалация к оператору. Доступна
    обеим сторонам мэтча. Создаёт жалобу-разбор и сигналит админам."""
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["id"] not in (m.user_id, m.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к мэтчу")
    # Повторный спор по той же смене не плодит жалобы/уведомления.
    if m.disputed:
        return _to_out(db, m, principal["role"])
    m.disputed = True
    who = "работник" if principal["id"] == m.user_id else "заведение"
    note = (body.note or "").strip()[:300]
    db.add(Report(
        reporter_id=principal["id"], target_type="match", target_id=m.id,
        reason="other", text=f"Спор по смене ({who}): {note}"[:1000],
    ))
    _sys(db, m.id, "Открыт спор по смене — разбирает оператор StaffSwipe.")
    other = m.employer_id if principal["id"] == m.user_id else m.user_id
    notify_owner(db, other, "По вашей смене открыт спор — с вами свяжется оператор.")
    notify_admins(f"⚠️ Спор по смене {m.id[:8]} ({who}): {note}. Админ-панель.")
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])


class ResolveMatchIn(BaseModel):
    outcome: str  # "completed" | "no_show"


class CancelIn(BaseModel):
    reason: Annotated[str, StringConstraints(max_length=200)] = ""


@router.post(
    "/{match_id}/cancel",
    response_model=MatchOut,
    dependencies=[Depends(rate_limit("cancel", 10, 3600))],
)
def cancel_shift(
    match_id: str,
    body: CancelIn | None = None,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Отменить смену, о которой уже договорились.

    Самое частое событие в подработке: человек заболел, заведение передумало,
    планы поменялись. До этого отмены не было ВООБЩЕ — и оставался ровно один
    способ: не прийти. То есть честный человек, предупредивший за два дня,
    получал ту же отметку «неявка», что и пропавший молча, а заведение
    узнавало обо всём в день смены. Место при этом оставалось занятым, и
    заменить человека было нельзя.

    Теперь отмена освобождает место (смена возвращается в ленту), вторая
    сторона получает уведомление сразу, а надёжность профиля страдает только
    при ПОЗДНЕЙ отмене — когда заменить человека заведение уже не успевает.
    """
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["id"] not in (m.user_id, m.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к мэтчу")
    if m.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail="Смену уже нельзя отменить: она закрыта или отменена.",
        )
    if m.seeker_checked_in or m.employer_checked_in:
        raise HTTPException(
            status_code=409,
            detail="Смена уже началась — отмена не поможет. "
                   "Напишите в чат или откройте спор.",
        )

    who = "seeker" if principal["id"] == m.user_id else "employer"
    reason = (body.reason.strip() if body else "")[:200]

    # Поздняя отмена — та, после которой заведение уже не успеет найти замену.
    late = False
    v = db.get(Vacancy, m.vacancy_id)
    if v is not None:
        try:
            start = shift_start_utc(v.date, v.start_time)
            hours_left = (start - datetime.now(UTC)).total_seconds() / 3600
            late = hours_left < settings.late_cancel_hours
        except (ValueError, TypeError):
            late = False

    m.status = "cancelled"
    m.cancelled_by = who
    m.cancel_reason = reason
    m.cancelled_late = late

    label = "работник" if who == "seeker" else "заведение"
    tail = f" Причина: {reason}" if reason else ""
    _sys(db, m.id, f"Смена отменена ({label}).{tail}")
    other = m.employer_id if who == "seeker" else m.user_id
    notify_owner(
        db, other,
        ("Работник отказался от смены." if who == "seeker"
         else "Заведение отменило смену.")
        + (f" Причина: {reason}" if reason else "")
        + (" Место снова свободно — смена вернулась в ленту."
           if who == "seeker" else ""),
    )
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])


@router.post("/{match_id}/resolve", response_model=MatchOut)
def resolve_match(
    match_id: str,
    body: ResolveMatchIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Оператор закрывает спор по смене: засчитать смену (completed + комиссия)
    ИЛИ зафиксировать неявку (no_show, бьёт по надёжности). Только админ —
    иначе спор мог бы висеть вечно, а неявка мошенника не засчитывалась бы."""
    if not _is_admin(db, principal):
        raise HTTPException(status_code=403, detail="Только для оператора")
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    m.disputed = False
    if body.outcome == "completed":
        m.status = "completed"
        m.no_show = False
        m.seeker_checked_in = True
        m.employer_checked_in = True
        _accrue_commission(db, m)
        _sys(db, m.id, "Оператор закрыл спор: смена засчитана ✓")
    elif body.outcome == "no_show":
        m.no_show = True  # засчитывается в надёжность работника
        _sys(db, m.id, "Оператор закрыл спор: зафиксирована неявка.")
    else:
        raise HTTPException(status_code=400, detail="outcome: completed|no_show")
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])


@router.post(
    "/{match_id}/confirm",
    response_model=MatchOut,
    dependencies=[Depends(rate_limit("confirm", 30, 60))],
)
def confirm(
    match_id: str,
    force: bool = False,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    # Подтверждать может только участник мэтча.
    if principal["id"] not in (m.user_id, m.employer_id):
        raise HTTPException(status_code=403, detail="Нет доступа к мэтчу")
    if principal["role"] == "seeker":
        # Пересечение по времени: предупреждаем, но не запрещаем. Человек в
        # двух местах не будет, и одно заведение останется без работника —
        # но бывает и так, что первую смену отменили, а статус ещё не
        # обновился. Решает человек; наше дело — показать, что он делает.
        if not force:
            vac = db.get(Vacancy, m.vacancy_id)
            clash = (
                overlapping_shifts(db, m.user_id, vac, exclude_match_id=m.id)
                if vac is not None else []
            )
            if clash:
                other = clash[0]
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "shift_conflict",
                        "message": (
                            f"У вас уже есть смена {_fmt_date(other.date)} "
                            f"{_fmt_time(other.start_time)}–"
                            f"{_fmt_time(other.end_time)}. Она пересекается "
                            f"с этой. Всё равно берёте?"
                        ),
                    },
                )
        m.confirmed_by_seeker = True
    else:
        m.confirmed_by_employer = True

    if m.confirmed_by_seeker and m.confirmed_by_employer and m.status == "matched":
        m.status = "confirmed"
        # 6-значный код из криптостойкого генератора (secrets) — 1 000 000
        # комбинаций; при лимите 5/мин перебор занял бы ~138 дней.
        m.checkin_code = f"{secrets.randbelow(1000000):06d}"
        _sys(db, m.id,
             "Смена подтверждена. В день смены отметятся обе стороны: работник — "
             "«я на смене», заведение — «человек пришёл».")
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])
