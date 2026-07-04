"""Мэтчи и подтверждение смены."""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..geo import distance_km
from ..models import Commission, Match, Message, Report, Vacancy
from ..notify import notify_admins, notify_owner
from ..ratelimit import rate_limit
from ..schemas import MatchOut
from ..security import current_principal

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


def _shift_pay(v: Vacancy) -> int:
    """Оплата смены, ₽ (зеркало estimatedPay в TMA)."""
    if v.rate_type == "perShift":
        return v.rate
    mins = v.end_time - v.start_time
    if mins <= 0:
        mins += 1440  # ночная смена через полночь
    return round(v.rate * mins / 60)


def _accrue_commission(db: Session, m: Match) -> None:
    """Начисляем комиссию за закрытую смену (учёт для счёта). Идемпотентно —
    по одной записи на смену. Деньги не списываем: это включится с ЮKassa."""
    if settings.commission_pct <= 0:
        return
    if db.query(Commission).filter(Commission.match_id == m.id).first():
        return
    v = db.get(Vacancy, m.vacancy_id)
    if v is None:
        return
    pay = _shift_pay(v)
    fee = round(pay * settings.commission_pct / 100)
    amount = max(settings.commission_min_rub, fee)
    db.add(Commission(
        employer_id=m.employer_id, match_id=m.id, shift_pay=pay, amount=amount,
    ))


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


@router.post("/{match_id}/attendance")
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
    if m.status not in ("confirmed", "completed"):
        raise HTTPException(status_code=400, detail="Смена ещё не подтверждена")

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


def _to_out(m: Match, role: str = "") -> MatchOut:
    # Код прихода показываем ТОЛЬКО заведению как помощник, пока смена не закрыта.
    show_code = role == "employer" and m.status == "confirmed" and bool(m.checkin_code)
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
        disputed=m.disputed,
    )


@router.get("", response_model=list[MatchOut])
def list_matches(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    col = Match.user_id if principal["role"] == "seeker" else Match.employer_id
    rows = db.query(Match).filter(col == principal["id"]).all()
    return [_to_out(m, principal["role"]) for m in rows]


@router.post(
    "/{match_id}/checkin",
    response_model=MatchOut,
    # Анти-перебор: 4-значный код нельзя подобрать скриптом —
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
        body.code and m.checkin_code and body.code.strip() == m.checkin_code
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
    _sys(db, m.id, "Работник отметился: на месте. Ждём подтверждения заведения.")
    _maybe_complete(db, m)
    db.commit()
    db.refresh(m)
    return _to_out(m, principal["role"])


@router.post("/{match_id}/dispute", response_model=MatchOut)
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
    return _to_out(m, principal["role"])


@router.post("/{match_id}/confirm", response_model=MatchOut)
def confirm(
    match_id: str,
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
    return _to_out(m, principal["role"])
