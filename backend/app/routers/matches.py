"""Мэтчи и подтверждение смены."""
import logging
import secrets
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..conflicts import overlapping_shifts
from ..db import get_db
from ..models import (
    Commission,
    Employer,
    Entitlement,
    Match,
    Message,
    Report,
    User,
    Vacancy,
    WalletTxn,
)
from ..notify import notify_admins, notify_owner
from ..ratelimit import rate_limit
from ..roles import time_ru
from ..schemas import MatchOut
from ..security import current_principal, secure_equals
from ..timeutil import shift_end_utc, shift_start_utc
from .analytics import _is_admin

logger = logging.getLogger("staffswipe.matches")

router = APIRouter(prefix="/matches", tags=["matches"])

# Сколько часов после смены заведение может уточнить фактическую длительность.
_HOURS_EDIT_WINDOW_H = 24


class AttendanceIn(BaseModel):
    attended: bool


class CheckinIn(BaseModel):
    """Отметка работника «я на смене» — только 6-значным кодом заведения.

    Геолокацию убрали совсем. Она просила у человека разрешение на доступ к
    местоположению (первое, на чём люди закрывают приложение), не работала в
    подвалах и на кухнях, где связи нет, и НИЧЕГО не доказывала: оказаться
    рядом с кафе можно и не работая. Плюс это лишние персональные данные,
    которые пришлось бы обосновывать по 152-ФЗ.

    Код лучше по существу: его называет заведение при встрече, значит человек
    физически пришёл и говорил с людьми на месте.
    """

    code: str | None = None


class DisputeIn(BaseModel):
    note: str = ""


def _sys(db: Session, match_id: str, text: str) -> None:
    db.add(Message(match_id=match_id, sender_id="system", text=text, is_system=True))


def _fmt_time(minutes: int) -> str:
    return time_ru(minutes)


def _fmt_date(iso: str) -> str:
    """2026-08-09 → 9 августа: в предупреждении человек должен узнать смену."""
    months = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля",
              "августа", "сентября", "октября", "ноября", "декабря")
    try:
        y, mth, d = (int(x) for x in iso.split("-"))
        return f"{d} {months[mth - 1]}"
    except (ValueError, IndexError):
        return iso


def _planned_minutes(v: Vacancy) -> int:
    mins = v.end_time - v.start_time
    if mins <= 0:
        mins += 1440  # ночная смена через полночь
    return mins


def _shift_pay(v: Vacancy, actual_minutes: int | None = None) -> int:
    """Оплата смены, ₽ (зеркало estimatedPay в TMA).

    actual_minutes — фактическая длительность, если смена разошлась с
    объявленной: человек опоздал, ушёл раньше или задержался. Почасовая
    оплата считается по факту, посменная — нет: там договорились на смену
    целиком, и часы значения не имеют.
    """
    if v.rate_type == "perShift":
        return v.rate
    mins = actual_minutes if actual_minutes is not None else _planned_minutes(v)
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
    pay = _shift_pay(v, m.actual_minutes)
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
    # Всё начисление — в отдельной «точке отката» (SAVEPOINT).
    #
    # Проверка выше («начисление уже есть?») не спасает от гонки: расчёт по
    # расписанию и кнопка «Смена состоялась» могут сойтись на одной смене в
    # одну секунду, оба увидят «начисления нет» и оба вставят запись. Вторая
    # вставка упирается в уникальность match_id — раньше эта ошибка вылетала
    # наверх: человеку показывалась «Внутренняя ошибка сервера», а ночной
    # расчёт падал на этой смене целиком и не доходил до остальных.
    #
    # С точкой отката проигравший в гонке откатывает только свою вставку
    # (и своё списание с баланса — двойного списания не будет), а всё, что
    # сделано до этого, остаётся. Комиссия уже начислена соседом — работа
    # выполнена, поэтому просто выходим.
    try:
        with db.begin_nested():
            # Атомарный UPDATE с условием «хватает денег» — двойное списание
            # при гонке невозможно.
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
            db.flush()
    except IntegrityError:
        logger.info("комиссия по смене %s уже начислена параллельно", m.id)


def _maybe_complete(db: Session, m: Match) -> None:
    """Обе стороны подтвердили выход — закрываем сразу, не дожидаясь расчёта.

    Но НЕ раньше конца самой смены. Иначе пара аккаунтов набивала себе
    закрытые смены, рейтинг и бейдж «Платит вовремя» за пару минут: заведение
    жмёт «человек пришёл», видит собственный код и вводит его за работника —
    и смена, назначенная на следующую неделю, уже «состоялась».
    """
    if (
        m.status == "confirmed"
        and m.seeker_checked_in
        and m.employer_checked_in
        and not m.disputed
        and _shift_is_over(db, m)
    ):
        m.status = "completed"
        m.no_show = False
        _accrue_commission(db, m)
        _sys(db, m.id, "Обе стороны подтвердили выход ✓ Смена закрыта.")


def _shift_is_over(db: Session, m: Match) -> bool:
    """Смена уже закончилась по времени?

    Одно правило на весь модуль. Без него «закрыть смену» и «отметить неявку»
    работали в любой момент, в том числе за неделю ДО смены, и это ломало сразу
    три вещи: работник получал ложную неявку и не мог даже отметиться кодом;
    пара аккаунтов набивала себе рейтинг и бейдж «Платит вовремя» за минуты, не
    дожидаясь никаких смен; акт «услуги оказаны полностью и в срок» выдавался
    на работу, которой ещё не было.
    """
    v = db.get(Vacancy, m.vacancy_id)
    if v is None:
        return True  # смены нет — блокировать нечего
    try:
        return datetime.now(UTC) >= shift_end_utc(
            v.date, v.start_time, v.end_time, v.city
        )
    except (ValueError, TypeError):
        return True  # битая дата — не мешаем людям работать


def _open_dispute(db: Session, m: Match, note: str) -> None:
    """Пометить смену спорной и завести разбор для оператора.

    Споры, рождавшиеся автоматически (стороны разошлись в показаниях), не
    создавали жалобу вовсе — единственным сигналом было сообщение админам в
    Telegram, а оно шлётся «как получится» и молча глотает сбои. В админ-панели
    таких смен не было видно нигде, а расчёт их не трогает: деньги зависали
    навсегда, и никто об этом не знал.
    """
    if m.disputed:
        return
    m.disputed = True
    db.add(Report(
        reporter_id="system", target_type="match", target_id=m.id,
        reason="other", text=note[:1000],
    ))
    notify_admins(f"⚠️ Спор по смене {m.id[:8]}: {note[:160]} Админ-панель.")


class NotHeldIn(BaseModel):
    reason: Annotated[str, StringConstraints(max_length=300)] = ""


@router.post(
    "/{match_id}/not-held",
    response_model=MatchOut,
    dependencies=[Depends(rate_limit("not-held", 20, 3600))],
)
def mark_not_held(
    match_id: str,
    body: NotHeldIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """«Смены не было» — единственный способ НЕ платить за договорённую смену.

    Раньше платить было не нужно по умолчанию: смена закрывалась только если
    обе стороны нажимали кнопку, а комиссия начислялась только при закрытии.
    Значит, чтобы не платить 10%, заведению достаточно было ничего не делать
    и не называть работнику код. Сторона, которая должна деньги, выигрывала
    от бездействия — дыра в самой конструкции.

    Теперь наоборот: договорились — считаем, что смена состоялась, пока
    кто-то не сказал обратного. И сказать это надо явно, кнопкой, с причиной.

    Что происходит дальше, зависит от того, есть ли возражение второй стороны:
      • работник назвал код заведения или заведение отметило «человек пришёл»
        — значит стороны расходятся в показаниях → спор, решает оператор;
      • вторая сторона молчит → смена закрывается без комиссии. Если это
        сказало заведение, а работник не отмечался — это неявка, она
        отражается в надёжности работника.
    """
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Смена не найдена")
    is_employer = principal["id"] == m.employer_id and principal["role"] == "employer"
    is_seeker = principal["id"] == m.user_id and principal["role"] == "seeker"
    if not (is_employer or is_seeker):
        raise HTTPException(status_code=403, detail="Нет доступа к смене")
    if m.status != "confirmed":
        raise HTTPException(
            status_code=400,
            detail="Так можно сказать только про подтверждённую смену",
        )
    # Только про СОСТОЯВШУЮСЯ по времени смену. Иначе заведение могло нажать
    # это в момент начала: смена уходила в «не состоялась» с неявкой на
    # работнике, а он в это время шёл работать — и потом не мог даже
    # отметиться кодом (ручка отвечала «смена не подтверждена»). День работы
    # бесплатно плюс ложная неявка в профиле. До начала смены для отказа есть
    # отмена, она честнее: вторая сторона успевает найти замену.
    v_now = db.get(Vacancy, m.vacancy_id)
    if v_now is not None:
        try:
            if datetime.now(UTC) < shift_end_utc(
                v_now.date, v_now.start_time, v_now.end_time, v_now.city
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Смена ещё не закончилась. Если она не нужна — "
                           "отмените её, так вторая сторона успеет "
                           "перестроиться.",
                )
        except (ValueError, TypeError):
            pass

    who = "employer" if is_employer else "seeker"
    m.not_held_by = who
    m.cancel_reason = body.reason[:300] or m.cancel_reason

    # Вторая сторона уже заявила, что человек был → показания расходятся.
    contradicted = (
        (is_employer and m.seeker_checked_in) or (is_seeker and m.employer_checked_in)
    )
    if contradicted:
        _open_dispute(
            db, m,
            "Одна сторона заявила «смены не было», вторая уже подтвердила выход.",
        )
        _sys(db, m.id,
             "Стороны расходятся: одна говорит, что смены не было, вторая — "
             "что человек был на месте. Разбирает оператор StaffSwipe.")
    else:
        m.status = "expired"
        # Неявка — только когда об этом говорит заведение и работник не
        # отмечался. Если о срыве говорит сам работник, наказывать его не за
        # что: это сигнал против заведения, он виден оператору в спорах.
        if is_employer:
            m.no_show = True
        tail = f" Причина: {body.reason[:200]}" if body.reason else ""
        _sys(db, m.id, f"Смена отмечена как несостоявшаяся.{tail} "
                       "Комиссия не начислена.")
        other = m.user_id if is_employer else m.employer_id
        notify_owner(
            db, other,
            "Вторая сторона отметила, что смена не состоялась. Комиссия не "
            "начислена. Если это не так — откройте смену и нажмите «Проблема».",
            open_app="Открыть смену", screen="chat", ident=m.id,
        )
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])


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

    # Отметка «не вышел» до начала смены отправляла человека работать по
    # закрытой смене: он приезжал, отработать успевал, а отметиться уже не мог
    # — ручка отвечала «смена не подтверждена». Плюс ложная неявка в профиле.
    # В «Смена не состоялась» эта проверка уже стояла; здесь была вторая дверь.
    if not body.attended and not _shift_is_over(db, m):
        raise HTTPException(
            status_code=409,
            detail="Смена ещё не закончилась. Если она не нужна — отмените "
                   "её, так работник успеет перестроиться.",
        )

    if body.attended:
        m.employer_checked_in = True
        m.no_show = False
        _maybe_complete(db, m)
    elif m.seeker_checked_in:
        # Работник говорит «был», заведение — «не вышел». Не решаем сами.
        _open_dispute(
            db, m,
            "Работник отметился кодом, заведение говорит «не вышел».",
        )
        _sys(db, m.id, "Спор по выходу — разбирает оператор StaffSwipe.")
    else:
        # Согласованная неявка. Статус тоже обязателен: без него смена
        # оставалась «подтверждённой» и ночной расчёт закрывал её как
        # состоявшуюся — снимал неявку и выставлял счёт честному заведению,
        # которое как раз и сообщило, что человек не вышел.
        m.no_show = True
        m.status = "expired"
        m.not_held_by = "employer"
        _sys(db, m.id, "Заведение отметило неявку. Комиссия не начислена.")
    db.commit()
    return {"ok": True, "noShow": m.no_show, "disputed": m.disputed}


def _to_out(
    db: Session,
    m: Match,
    role: str = "",
    vac: Vacancy | None = None,
    emp: Employer | None = None,
    usr: User | None = None,
) -> MatchOut:
    # Код прихода показываем ТОЛЬКО заведению как помощник, пока смена не закрыта.
    show_code = role == "employer" and m.status == "confirmed" and bool(m.checkin_code)
    # vac/emp/usr передают заранее, когда мэтчей много: иначе на каждую строку
    # списка уходил отдельный запрос (25 мэтчей = 27 запросов).
    v = vac if vac is not None else db.get(Vacancy, m.vacancy_id)
    e = emp if emp is not None else db.get(Employer, m.employer_id)
    u = usr if usr is not None else db.get(User, m.user_id)
    pay = _shift_pay(v, m.actual_minutes) if v is not None else 0
    # Фото заведения: сначала логотип, если его нет — снимок интерьера смены.
    # Пустая строка тоже валидна: приложение рисует букву названия.
    photo = ""
    if e is not None and e.photo_url:
        photo = e.photo_url
    elif v is not None:
        photo = v.interior_photo_url
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
        shift_date=v.date if v is not None else "",
        shift_start=v.start_time if v is not None else 0,
        shift_end=v.end_time if v is not None else 0,
        reschedule_date=m.reschedule_date or "",
        reschedule_start=m.reschedule_start,
        reschedule_end=m.reschedule_end,
        role=v.role if v is not None else "",
        company_name=e.company_name if e is not None else "",
        company_photo_url=photo,
        seeker_name=u.name if u is not None else "",
    )


@router.get("", response_model=list[MatchOut])
def list_matches(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    col = Match.user_id if principal["role"] == "seeker" else Match.employer_id
    rows = db.query(Match).filter(col == principal["id"]).all()
    # Смены, заведения и людей подгружаем ПО ОДНОМУ запросу на весь список, а не
    # по одному на строку.
    vacs = {
        v.id: v
        for v in db.query(Vacancy).filter(
            Vacancy.id.in_([m.vacancy_id for m in rows] or ["__none__"])
        )
    }
    emps = {
        e.id: e
        for e in db.query(Employer).filter(
            Employer.id.in_([m.employer_id for m in rows] or ["__none__"])
        )
    }
    usrs = {
        u.id: u
        for u in db.query(User).filter(
            User.id.in_([m.user_id for m in rows] or ["__none__"])
        )
    }
    return [
        _to_out(
            db,
            m,
            principal["role"],
            vac=vacs.get(m.vacancy_id),
            emp=emps.get(m.employer_id),
            usr=usrs.get(m.user_id),
        )
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
    """Отметка работника «я на смене» по коду заведения.

    Отметка НЕ обязательна для закрытия смены: смена закрывается сама (см.
    settle_shifts). Код нужен для другого — он доказательство. Если работник
    его назвал, заведение уже не сможет тихо записать смену в неявку: такое
    расхождение уходит к оператору.
    """
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
    if not by_code:
        raise HTTPException(
            status_code=400,
            detail="Неверный код. Попросите его у администратора заведения.",
        )
    m.seeker_checked_in = True
    m.checkin_by_code = True
    _sys(db, m.id, "Работник назвал код заведения ✓ Он был на месте.")
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


class HoursIn(BaseModel):
    # Фактическая длительность в минутах: 30 минут — минимум осмысленной
    # смены, 16 часов — потолок, дальше это уже не подработка.
    minutes: Annotated[int, Field(ge=30, le=960)]
    note: Annotated[str, StringConstraints(max_length=200)] = ""


@router.post(
    "/{match_id}/hours",
    response_model=MatchOut,
    dependencies=[Depends(rate_limit("hours", 20, 3600))],
)
def set_actual_hours(
    match_id: str,
    body: HoursIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Заведение указывает фактическую длительность смены.

    Человек опоздал на час, ушёл раньше или, наоборот, задержался — оплата и
    комиссия должны считаться по факту, а не по объявлению. Раньше это
    решалось только перепиской и ручной правкой оператора.

    Работник ВИДИТ изменение: оно попадает в чат смены и приходит
    уведомлением. Молча уменьшать оплату нельзя — это прямой путь к
    «сервис на стороне заведений». Не согласен — кнопка «Проблема» рядом.

    Почасовая оплата пересчитывается, посменная — нет: там договорились на
    смену целиком. Комиссию пересчитываем, только пока она не оплачена.
    """
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["role"] != "employer" or principal["id"] != m.employer_id:
        raise HTTPException(status_code=403, detail="Только работодатель смены")
    if m.status not in ("confirmed", "completed"):
        raise HTTPException(
            status_code=400,
            detail="Часы указываются по подтверждённой или закрытой смене",
        )
    v = db.get(Vacancy, m.vacancy_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Смена не найдена")

    planned = _planned_minutes(v)

    # Уточнение — про ту смену, что была вчера, а не про любую в истории.
    # Без срока это была ретро-скидка на комиссию: смену 12 ч × 500 ₽ (600 ₽
    # комиссии) можно было «уточнить» до 30 минут и платить 25 ₽. Прогнать так
    # весь месяц перед счётом — платить около 4% от долга. Заодно у работника
    # усыхал заработок и сумма в акте.
    try:
        ends = shift_end_utc(v.date, v.start_time, v.end_time, v.city)
        # Нижняя граница окна. Её не было, и «уточнить часы» работало ЗА НЕДЕЛЮ
        # до смены: заведение сразу после подтверждения урезало объявленные
        # часы вдвое — то есть выдавало себе скидку 50% на комиссию по каждой
        # смене, без согласия работника.
        if datetime.now(UTC) < ends:
            raise HTTPException(
                status_code=409,
                detail="Часы уточняют после смены, а не до неё.",
            )
        if (datetime.now(UTC) - ends).total_seconds() > _HOURS_EDIT_WINDOW_H * 3600:
            raise HTTPException(
                status_code=409,
                detail="Уточнить часы можно в течение суток после смены. "
                       "Позже — только через оператора.",
            )
    except (ValueError, TypeError):
        pass

    # И не больше чем вдвое в любую сторону от объявленного: «12 часов
    # превратились в 30 минут» — это не уточнение, это другая договорённость.
    if not planned / 2 <= body.minutes <= planned * 2:
        raise HTTPException(
            status_code=409,
            detail=f"Слишком далеко от объявленных {planned / 60:.1f} ч. "
                   "Если смена прошла совсем иначе — напишите оператору.",
        )
    m.actual_minutes = body.minutes
    new_pay = _shift_pay(v, body.minutes)

    # Пересчитываем комиссию, если она ещё не оплачена: с оплаченной так
    # делать нельзя — деньги уже прошли, это работа оператора.
    c = db.query(Commission).filter(Commission.match_id == m.id).first()
    if c is not None and c.status == "pending":
        fee = int(
            (Decimal(new_pay) * settings.commission_pct / 100).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )
        c.shift_pay = new_pay
        c.amount = max(settings.commission_min_rub, fee)

    hours = body.minutes / 60
    word = "меньше" if body.minutes < planned else "больше"
    tail = f" Комментарий: {body.note}" if body.note else ""
    _sys(
        db, m.id,
        f"Заведение указало фактическую длительность: {hours:.1f} ч "
        f"({word} объявленных {planned / 60:.1f} ч). "
        f"Оплата по ставке — {new_pay} ₽.{tail} "
        "Не согласны — нажмите «Проблема», разберёт оператор.",
    )
    notify_owner(
        db, m.user_id,
        f"По смене указана фактическая длительность {hours:.1f} ч, "
        f"оплата {new_pay} ₽. Если это не так — откройте спор в чате смены.",
    )
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"], vac=v)


class RescheduleIn(BaseModel):
    date: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    start_time: Annotated[int, Field(ge=0, le=1440)]
    end_time: Annotated[int, Field(ge=0, le=1440)]

    @model_validator(mode="after")
    def _sane(self) -> "RescheduleIn":
        # Те же две проверки, что и при публикации смены. Перенос шёл мимо них,
        # а он переписывает саму смену:
        #  • перенос во вчера — смена сразу пропадает из ленты и из напоминаний,
        #    хотя мэтч остаётся «подтверждён»;
        #  • одинаковые начало и конец у почасовой смены считаются «ночной
        #    через полночь», то есть 24 часами: оплата и комиссия вырастали
        #    в три раза от одной опечатки.
        from ..timeutil import local_today

        if self.date < local_today():
            raise ValueError("Перенести смену в прошлое нельзя")
        if self.start_time == self.end_time:
            raise ValueError("Время начала и конца смены не должно совпадать")
        return self


@router.post(
    "/{match_id}/reschedule",
    response_model=MatchOut,
    dependencies=[Depends(rate_limit("reschedule", 10, 3600))],
)
def propose_reschedule(
    match_id: str,
    body: RescheduleIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Заведение предлагает перенести смену на другой день или время.

    «Выйди не в пятницу, а в субботу» — обычная просьба. Раньше её решали
    перепиской: заведение снимало смену и публиковало новую, человек искал её
    заново и мог не найти. Половина договорённостей разваливалась на этом шаге.

    Перенос — именно ПРЕДЛОЖЕНИЕ: условия смены человек уже принял, и менять
    их односторонне нельзя. Работник соглашается или отказывается.
    """
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["role"] != "employer" or principal["id"] != m.employer_id:
        raise HTTPException(status_code=403, detail="Только работодатель смены")
    if m.status not in ("matched", "confirmed"):
        raise HTTPException(
            status_code=409, detail="Переносить можно только предстоящую смену"
        )
    if m.seeker_checked_in or m.employer_checked_in:
        raise HTTPException(status_code=409, detail="Смена уже началась")
    # И по времени тоже. Иначе перенос отработанной смены на будущее уводил её
    # из-под расчёта: одно согласие работника («давай перепишем на следующую
    # неделю») — и комиссия откладывалась на неопределённый срок.
    _vac = db.get(Vacancy, m.vacancy_id)
    if _vac is not None:
        try:
            if datetime.now(UTC) >= shift_start_utc(
                _vac.date, _vac.start_time, _vac.city
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Смена уже началась — переносить поздно. "
                           "Договоритесь в чате о новой смене.",
                )
        except (ValueError, TypeError):
            pass

    # Переносим саму смену, поэтому на ней не должно быть других людей:
    # иначе перенос ударил бы по тем, кто ни о чём не договаривался.
    others = (
        db.query(Match)
        .filter(
            Match.vacancy_id == m.vacancy_id,
            Match.id != m.id,
            Match.status.in_(("matched", "confirmed", "completed")),
        )
        .count()
    )
    if others:
        raise HTTPException(
            status_code=409,
            detail="На эту смену набраны и другие люди — перенести её нельзя. "
                   "Опубликуйте новую смену на нужную дату.",
        )

    m.reschedule_date = body.date
    m.reschedule_start = body.start_time
    m.reschedule_end = body.end_time
    _sys(
        db, m.id,
        f"Заведение предлагает перенести смену на {_fmt_date(body.date)}, "
        f"{_fmt_time(body.start_time)}–{_fmt_time(body.end_time)}. "
        "Работник может согласиться или отказаться.",
    )
    notify_owner(
        db, m.user_id,
        f"Заведение предлагает перенести смену на {_fmt_date(body.date)} "
        f"({_fmt_time(body.start_time)}–{_fmt_time(body.end_time)}). "
        "Откройте чат смены, чтобы согласиться или отказаться.",
        open_app="Открыть смену", screen="chat", ident=m.id,
    )
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])


@router.post("/{match_id}/reschedule/accept", response_model=MatchOut)
def accept_reschedule(
    match_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Работник соглашается на перенос — смена меняет дату и время."""
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["role"] != "seeker" or principal["id"] != m.user_id:
        raise HTTPException(status_code=403, detail="Только работник смены")
    if not m.reschedule_date:
        raise HTTPException(status_code=404, detail="Переноса не предлагали")
    if m.status not in ("matched", "confirmed"):
        raise HTTPException(status_code=409, detail="Смена уже закрыта")

    v = db.get(Vacancy, m.vacancy_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Смена не найдена")

    # Согласиться можно только на перенос ещё не начавшейся смены.
    #
    # Проверка стояла только на СТОРОНЕ ПРЕДЛОЖЕНИЯ, а принять старое
    # предложение можно было когда угодно — и это уводило отработанную смену
    # из-под расчёта навсегда: дата вакансии переезжала в будущее, комиссия не
    # начислялась, а предложение можно было повторить и крутить бесконечно.
    # Для честного работника это ловушка: ему приходит «откройте чат, чтобы
    # согласиться», он жмёт на следующий день, думая, что речь о новой смене,
    # — и своими руками стирает отработанную.
    try:
        if datetime.now(UTC) >= shift_start_utc(v.date, v.start_time, v.city):
            m.reschedule_date = ""
            m.reschedule_start = None
            m.reschedule_end = None
            db.commit()
            raise HTTPException(
                status_code=409,
                detail="Смена уже началась — переносить поздно. "
                       "Договоритесь в чате о новой смене.",
            )
    except (ValueError, TypeError):
        pass

    # Новое время может пересечься с другой сменой человека — предупреждать
    # поздно, он уже согласился, поэтому просто фиксируем это в чате.
    v.date = m.reschedule_date
    v.start_time = m.reschedule_start
    v.end_time = m.reschedule_end
    _sys(
        db, m.id,
        f"Работник согласился на перенос. Новое время смены: "
        f"{_fmt_date(v.date)}, {_fmt_time(v.start_time)}–{_fmt_time(v.end_time)}.",
    )
    notify_owner(db, m.employer_id,
                 f"Работник согласился на перенос смены на {_fmt_date(v.date)}.")
    m.reschedule_date = ""
    m.reschedule_start = None
    m.reschedule_end = None
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"], vac=v)


@router.post("/{match_id}/reschedule/decline", response_model=MatchOut)
def decline_reschedule(
    match_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
):
    """Работник отказывается от переноса — смена остаётся как была.

    Это не отмена: изначальная договорённость в силе. Если заведение
    настаивает, оно отменяет смену обычной кнопкой и несёт за это те же
    последствия, что и всегда.
    """
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Мэтч не найден")
    if principal["role"] != "seeker" or principal["id"] != m.user_id:
        raise HTTPException(status_code=403, detail="Только работник смены")
    if not m.reschedule_date:
        raise HTTPException(status_code=404, detail="Переноса не предлагали")
    m.reschedule_date = ""
    m.reschedule_start = None
    m.reschedule_end = None
    _sys(db, m.id, "Работник отказался от переноса — смена остаётся в прежнее время.")
    notify_owner(db, m.employer_id,
                 "Работник не может выйти в новое время. Смена остаётся "
                 "в прежнее; если она вам больше не нужна — отмените её.")
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])


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
            start = shift_start_utc(v.date, v.start_time, v.city)
            # Отмена — про БУДУЩУЮ смену. Отменять начавшуюся нельзя: это была
            # универсальная кнопка «не платить». Заведение просто не называло
            # код, не жало «человек пришёл», а наутро отменяло смену — статус
            # уходил в «отменена», расчёт её больше не видел, и работа
            # получалась бесплатной. Двумя тапами, не через API.
            if datetime.now(UTC) >= start:
                raise HTTPException(
                    status_code=409,
                    detail="Смена уже началась — отменить её нельзя. "
                           "Если она не состоялась, нажмите «Смена не "
                           "состоялась»; если состоялась, но что-то не так — "
                           "«Проблема», разберёт оператор.",
                )
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
        # Статус обязателен: смена, оставшаяся «подтверждённой», ночью
        # попадала под общий расчёт — он ставил completed, СНИМАЛ неявку и
        # начислял комиссию. То есть заведение, ВЫИГРАВШЕЕ спор, получало
        # счёт за смену, которой не было, а с работника снималась неявка.
        m.status = "expired"
        m.not_held_by = "employer"
        _sys(db, m.id, "Оператор закрыл спор: зафиксирована неявка. "
                       "Комиссия не начислена.")
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
             "Смена подтверждена ✓ Дальше ничего нажимать не нужно: через 12 "
             "часов после окончания она закроется сама. Если смена не "
             "состоится — нажмите «Смена не состоялась», и комиссии не будет.")
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])
