"""Мэтчи и подтверждение смены."""
import logging
import secrets
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints, model_validator
from sqlalchemy.orm import Session

from ..config import settings
from ..conflicts import overlapping_shifts
from ..db import get_db
from ..models import (
    Commission,
    Employer,
    Match,
    Report,
    User,
    Vacancy,
)
from ..notify import notify_admins, notify_owner
from ..ratelimit import rate_limit
from ..schemas import MatchOut
from ..security import current_principal, secure_equals
from ..shift_rules import (
    accrue_commission,
    fmt_date,
    fmt_time,
    maybe_complete,
    open_dispute,
    planned_minutes,
    shift_is_over,
    shift_pay,
    sys_message,
)
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
    # И про ту, которую подтвердил только работник: за неё тоже начисляется
    # комиссия (см. settle_shifts), значит и выход из неё должен быть.
    if m.status not in ("confirmed", "matched"):
        raise HTTPException(
            status_code=400,
            detail="Так можно сказать только про предстоящую смену",
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
        open_dispute(
            db, m,
            "Одна сторона заявила «смены не было», вторая уже подтвердила выход.",
        )
        sys_message(db, m.id,
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
        sys_message(db, m.id, f"Смена отмечена как несостоявшаяся.{tail} "
                       "Комиссия не начислена.")
        other = m.user_id if is_employer else m.employer_id
        notify_owner(
            db, other,
            "Смену отметили как несостоявшуюся — комиссию за неё не берём. "
            "Если это не так, откройте смену и позовите оператора.",
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
    if not body.attended and not shift_is_over(db, m):
        raise HTTPException(
            status_code=409,
            detail="Смена ещё не закончилась. Если она не нужна — отмените "
                   "её, так работник успеет перестроиться.",
        )

    if body.attended:
        m.employer_checked_in = True
        m.no_show = False
        maybe_complete(db, m)
    elif m.seeker_checked_in:
        # Работник говорит «был», заведение — «не вышел». Не решаем сами.
        open_dispute(
            db, m,
            "Работник отметился кодом, заведение говорит «не вышел».",
        )
        sys_message(db, m.id, "Спор по выходу — разбирает оператор StaffSwipe.")
    else:
        # Согласованная неявка. Статус тоже обязателен: без него смена
        # оставалась «подтверждённой» и ночной расчёт закрывал её как
        # состоявшуюся — снимал неявку и выставлял счёт честному заведению,
        # которое как раз и сообщило, что человек не вышел.
        m.no_show = True
        m.status = "expired"
        m.not_held_by = "employer"
        sys_message(db, m.id, "Заведение отметило неявку. Комиссия не начислена.")
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
    pay = shift_pay(v, m.actual_minutes) if v is not None else 0
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
    sys_message(db, m.id, "Работник назвал код заведения ✓ Он был на месте.")
    maybe_complete(db, m)
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
    sys_message(db, m.id, "Открыт спор по смене — разбирает оператор StaffSwipe.")
    other = m.employer_id if principal["id"] == m.user_id else m.user_id
    notify_owner(db, other, "По вашей смене позвали оператора — он скоро напишет.")
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

    planned = planned_minutes(v)

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
    new_pay = shift_pay(v, body.minutes)

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
    sys_message(
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
    sys_message(
        db, m.id,
        f"Заведение предлагает перенести смену на {fmt_date(body.date)}, "
        f"{fmt_time(body.start_time)}–{fmt_time(body.end_time)}. "
        "Работник может согласиться или отказаться.",
    )
    notify_owner(
        db, m.user_id,
        f"Заведение предлагает перенести смену на {fmt_date(body.date)} "
        f"({fmt_time(body.start_time)}–{fmt_time(body.end_time)}). "
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

    # И само предложение не должно протухнуть. При отправке дата проверяется
    # («в прошлое нельзя»), но согласиться можно и через неделю — а тогда
    # предложенный день уже позади. Смена переезжала во вчера и становилась
    # «закончившейся» в ту же секунду: заведение могло сразу отметить неявку
    # человеку, который физически не мог выйти, а расчёт закрывал смену,
    # которой не было. Обычно это даже не злой умысел: работник открывает чат
    # через день и жмёт «Согласиться», не глядя на дату.
    try:
        if datetime.now(UTC) >= shift_start_utc(
            m.reschedule_date, m.reschedule_start, v.city
        ):
            m.reschedule_date = ""
            m.reschedule_start = None
            m.reschedule_end = None
            db.commit()
            raise HTTPException(
                status_code=409,
                detail="Предложенное время уже прошло. "
                       "Попросите заведение предложить новый день.",
            )
    except (ValueError, TypeError):
        pass

    # Новое время может пересечься с другой сменой человека — предупреждать
    # поздно, он уже согласился, поэтому просто фиксируем это в чате.
    v.date = m.reschedule_date
    v.start_time = m.reschedule_start
    v.end_time = m.reschedule_end
    sys_message(
        db, m.id,
        f"Работник согласился на перенос. Новое время смены: "
        f"{fmt_date(v.date)}, {fmt_time(v.start_time)}–{fmt_time(v.end_time)}.",
    )
    notify_owner(db, m.employer_id,
                 f"Работник согласился на перенос смены на {fmt_date(v.date)}.")
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
    sys_message(
        db, m.id, "Работник отказался от переноса — смена остаётся в прежнее время."
    )
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
    sys_message(db, m.id, f"Смена отменена ({label}).{tail}")
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
        accrue_commission(db, m)
        sys_message(db, m.id, "Оператор закрыл спор: смена засчитана ✓")
    elif body.outcome == "no_show":
        m.no_show = True  # засчитывается в надёжность работника
        # Статус обязателен: смена, оставшаяся «подтверждённой», ночью
        # попадала под общий расчёт — он ставил completed, СНИМАЛ неявку и
        # начислял комиссию. То есть заведение, ВЫИГРАВШЕЕ спор, получало
        # счёт за смену, которой не было, а с работника снималась неявка.
        m.status = "expired"
        m.not_held_by = "employer"
        sys_message(db, m.id, "Оператор закрыл спор: зафиксирована неявка. "
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
                            f"У вас уже есть смена {fmt_date(other.date)} "
                            f"{fmt_time(other.start_time)}–"
                            f"{fmt_time(other.end_time)}. Она пересекается "
                            f"с этой. Всё равно берёте?"
                        ),
                    },
                )
        m.confirmed_by_seeker = True
    else:
        m.confirmed_by_employer = True

    # Работник сказал «выхожу», а заведение ещё молчит. Дальше молчание будет
    # означать согласие — и за смену начислится комиссия. Человек должен
    # узнать об этом сейчас, а не из счёта.
    if (
        principal["role"] == "seeker"
        and m.status == "matched"
        and not m.confirmed_by_employer
    ):
        notify_owner(
            db, m.employer_id,
            "Работник подтвердил выход на смену. Если смена не нужна — "
            "отмените её, иначе она считается состоявшейся и за неё будет "
            "комиссия.",
            open_app="Открыть смену", screen="chat", ident=m.id,
        )
    if m.confirmed_by_seeker and m.confirmed_by_employer and m.status == "matched":
        m.status = "confirmed"
        # 6-значный код из криптостойкого генератора (secrets) — 1 000 000
        # комбинаций; при лимите 5/мин перебор занял бы ~138 дней.
        m.checkin_code = f"{secrets.randbelow(1000000):06d}"
        sys_message(db, m.id,
             "Смена подтверждена ✓ Дальше ничего нажимать не нужно: через 12 "
             "часов после окончания она закроется сама. Если смена не "
             "состоится — нажмите «Смена не состоялась», и комиссии не будет.")
    db.commit()
    db.refresh(m)
    return _to_out(db, m, principal["role"])
