"""Оператор: жалобы, споры, модерация и сводки.

Файл был на 1272 строки: и разбор жалоб, и блокировки, и деньги, и перенос
аккаунта, и удаление по 152-ФЗ — всё вперемешку. Ручки друг от друга не
зависят, поэтому делится он ровно по темам, а не «пополам».

Вторая половина — деньги и аккаунты — в admin_accounts.py. Роутер там свой,
но с тем же префиксом: снаружи админка осталась одним разделом.
"""

from datetime import UTC, date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import (
    Commission,
    Employer,
    JobRun,
    Match,
    Message,
    Purchase,
    Report,
    Swipe,
    User,
    Vacancy,
    WalletTxn,
)
from ..notify import notify_owner
from ..roles import date_ru, role_ru, time_ru
from ..security import current_principal
from ..shift_rules import shift_pay
from ..timeutil import business_tz, local_today
from .analytics import _is_admin

# Потолок выдачи переписки: у долгой смены сообщений сотни, а
# оператору нужен разговор, а не выгрузка базы.
_DISPUTE_CHAT_MAX = 500

router = APIRouter(prefix="/admin", tags=["admin"])

_POSITIVE = ("like",)


def require_admin(
    db: Session = Depends(get_db),
    principal: dict = Depends(current_principal),
) -> dict:
    if not _is_admin(db, principal):
        raise HTTPException(status_code=403, detail="Только для администратора")
    return principal


class Overview(BaseModel):
    users: int
    activeVacancies: int
    likes: int
    matches: int
    openReports: int
    # Закрытые смены — главная цифра сервиса: только с них берётся комиссия.
    # Раньше на её месте было число активных подписок, которое всегда равно
    # нулю: подписок в продукте нет.
    completedShifts: int


@router.get("/overview", response_model=Overview)
def overview(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    return Overview(
        users=db.query(func.count(User.id)).scalar() or 0,
        activeVacancies=db.query(func.count(Vacancy.id))
        .filter(Vacancy.status == "active")
        .scalar()
        or 0,
        likes=db.query(func.count(Swipe.id))
        .filter(Swipe.direction.in_(_POSITIVE))
        .scalar()
        or 0,
        matches=db.query(func.count(Match.id)).scalar() or 0,
        openReports=db.query(func.count(Report.id))
        .filter(Report.status == "open")
        .scalar()
        or 0,
        completedShifts=db.query(func.count(Match.id))
        .filter(Match.status == "completed")
        .scalar()
        or 0,
    )


class RevenueOut(BaseModel):
    """Деньги сервиса. Модель одна — комиссия за закрытую смену."""

    commissionAccruedRub: int   # начислено за всё время
    commissionPaidRub: int      # из них оплачено
    commissionPendingRub: int   # к оплате сейчас
    commissionWrittenOffRub: int  # списано: прощено по спорам и безнадёжный долг
    shiftsBilled: int           # смен, за которые начислена комиссия
    topupsRub: int              # пополнений баланса всего (аванс, НЕ выручка)
    topupsCardRub: int          # из них картой (ЮKassa)
    topupsManualRub: int        # из них зачислил оператор (перевод/СБП)


@router.get("/revenue", response_model=RevenueOut)
def revenue(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    def _commission(status: str | None = None) -> int:
        q = db.query(func.coalesce(func.sum(Commission.amount), 0))
        if status:
            q = q.filter(Commission.status == status)
        return int(q.scalar() or 0)

    # Пополнения считаем по движениям баланса, а не по платежам ЮKassa.
    # Раньше здесь были только карточные платежи, а на пилоте картой не платит
    # никто: деньги приходят переводом, и оператор зачисляет их руками. Владелец
    # видел «Пополнено 0 ₽» при живых деньгах на счёте и не мог понять,
    # доходят платежи или нет.
    topups_all = int(
        db.query(func.coalesce(func.sum(WalletTxn.amount), 0))
        .filter(WalletTxn.kind == "topup")
        .scalar()
        or 0
    )
    topups_card = int(
        db.query(func.coalesce(func.sum(Purchase.amount), 0))
        .filter(Purchase.status == "paid", Purchase.sku == "wallet_topup")
        .scalar()
        or 0
    )

    return RevenueOut(
        commissionAccruedRub=_commission(),
        commissionPaidRub=_commission("paid"),
        commissionPendingRub=_commission("pending"),
        commissionWrittenOffRub=_commission("written_off"),
        shiftsBilled=int(db.query(func.count(Commission.id)).scalar() or 0),
        # Аванс — это обязательство перед заведением, а не заработок сервиса.
        topupsRub=topups_all,
        topupsCardRub=topups_card,
        topupsManualRub=max(0, topups_all - topups_card),
    )


class DisputeFacts(BaseModel):
    """Всё, по чему оператор решает спор, — в одном месте.

    Раньше в карточке жалобы было ровно два слова: «переписка по мэтчу». Ни
    имён, ни даты смены, ни главного — называл ли работник код прихода. А
    выбирать оператору предлагалось между «засчитать смену» и «зафиксировать
    неявку», то есть вслепую. Код знает только заведение: если работник его
    назвал — он был на месте и говорил с людьми, и это решает спор почти
    всегда.
    """

    worker: str = ""
    venue: str = ""
    shiftWhen: str = ""          # «16 августа, 10:00–18:00»
    checkedInByCode: bool = False  # работник назвал код — доказательство прихода
    venueMarkedAttended: bool = False
    notHeldBy: str = ""          # кто заявил «смена не состоялась»
    payRub: int = 0
    commission: str = ""         # не начислена / к оплате / оплачена / списана
    status: str = ""


class ReportOut(BaseModel):
    id: str
    targetType: str
    targetId: str
    targetInfo: str  # что именно на разборе (название вакансии/имя/…)
    reason: str
    text: str
    status: str
    createdAt: str
    # Заполняется только для спора по смене.
    dispute: DisputeFacts | None = None


# Должности в админке — по-русски (общий словарь, см. app/roles.py). Здесь
# лежала своя копия, и в ней два ключа были выдуманы — `runner` и `manager`
# вместо настоящих `waiter_assistant` и `administrator`: оператор видел в
# жалобах «waiter_assistant · 300₽».


def _describe_target(db: Session, target_type: str, target_id: str) -> str:
    """Человекочитаемое описание цели жалобы — чтобы админ видел контент."""
    if target_type == "vacancy":
        v = db.get(Vacancy, target_id)
        if v is None:
            return "вакансия удалена"
        emp = db.get(Employer, v.employer_id)
        # Неразрывный пробел перед знаком рубля: «300₽» слипалось в одно
        # слово, а с обычным пробелом сумма переносилась на новую строку
        # отдельно от знака.
        return (
            f"{role_ru(v.role)} · {emp.company_name if emp else '—'} · "
            f"{v.rate} ₽"
        )
    if target_type == "user":
        u = db.get(User, target_id) or db.get(Employer, target_id)
        return getattr(u, "name", None) or getattr(u, "company_name", None) or "—"
    return "переписка по мэтчу"


_COMMISSION_RU = {
    "pending": "к оплате",
    "paid": "оплачена",
    "written_off": "списана оператором",
}


def _dispute_facts(db: Session, match_id: str) -> DisputeFacts | None:
    """Собрать факты по спорной смене одним заходом."""
    m = db.get(Match, match_id)
    if m is None:
        return None
    u = db.get(User, m.user_id)
    e = db.get(Employer, m.employer_id)
    v = db.get(Vacancy, m.vacancy_id)
    when = ""
    if v is not None:
        when = f"{date_ru(v.date)}, {time_ru(v.start_time)}–{time_ru(v.end_time)}"
        if v.role:
            when = f"{role_ru(v.role)} · {when}"
    c = db.query(Commission).filter(Commission.match_id == match_id).first()
    # Оплата — та же, что видят стороны: по факту, если часы уточняли.
    pay = shift_pay(v, m.actual_minutes) if v is not None else 0
    return DisputeFacts(
        worker=(u.name if u else "") or "работник без имени",
        venue=(e.company_name if e else "") or "заведение без названия",
        shiftWhen=when,
        checkedInByCode=bool(m.checkin_by_code),
        venueMarkedAttended=bool(m.employer_checked_in),
        notHeldBy=m.not_held_by or "",
        payRub=int(pay),
        commission=_COMMISSION_RU.get(c.status, c.status) if c else "не начислена",
        status=m.status,
    )


@router.get("/reports", response_model=list[ReportOut])
def list_reports(
    status: str = "open",
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    q = db.query(Report)
    if status != "all":
        q = q.filter(Report.status == status)
    rows = q.order_by(Report.created_at.desc()).limit(100).all()
    return [
        ReportOut(
            id=r.id,
            targetType=r.target_type,
            targetId=r.target_id,
            targetInfo=_describe_target(db, r.target_type, r.target_id),
            reason=r.reason,
            text=r.text,
            status=r.status,
            createdAt=r.created_at.isoformat(),
            dispute=(
                _dispute_facts(db, r.target_id)
                if r.target_type == "match" else None
            ),
        )
        for r in rows
    ]


class ResolveIn(BaseModel):
    reply: str = ""  # необязательный ответ заявителю (уходит ему в бота)


@router.post("/reports/{report_id}/resolve")
def resolve_report(
    report_id: str,
    body: ResolveIn | None = None,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    rep = db.get(Report, report_id)
    if rep is None:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")
    rep.status = "reviewed"
    # Жалоба по СМЕНЕ — это спор, и спорную смену расчёт не трогает вообще.
    # Раньше «Закрыть жалобу» помечало жалобу разобранной, а признак спора со
    # смены не снимало: смена зависала навсегда — не закрывалась, комиссия по
    # ней не начислялась никогда, и обе стороны видели вечный «спор». Один
    # неверный тап в админке стоил денег без единого следа.
    #
    # «Закрыть жалобу» без вердикта = «оснований нет, пусть идёт своим
    # чередом». Явные вердикты — отдельные кнопки «Засчитать смену» и
    # «Зафиксировать неявку» (POST /matches/{id}/resolve), они снимают спор
    # сами и ставят исход.
    if rep.target_type == "match":
        m = db.get(Match, rep.target_id)
        if m is not None and m.disputed:
            m.disputed = False
            db.add(Message(
                match_id=m.id, sender_id="system", is_system=True,
                text="Оператор разобрал спор: оснований не нашлось, "
                     "смена идёт своим чередом.",
            ))
    db.commit()
    # Если админ написал ответ — доставляем заявителю (чтобы человек видел, что
    # его услышали). Без bot-токена notify_owner — no-op.
    reply = (body.reply.strip() if body else "")
    if reply:
        notify_owner(db, rep.reporter_id, f"По вашей жалобе: {reply}")
    return {"ok": True}


def _offender_id(db: Session, rep: Report) -> str | None:
    """Кого предупреждаем по жалобе: пользователь напрямую или владелец вакансии."""
    if rep.target_type == "user":
        return rep.target_id
    if rep.target_type == "vacancy":
        v = db.get(Vacancy, rep.target_id)
        return v.employer_id if v else None
    return None  # по переписке мэтча предупреждение не выдаём


class WarnIn(BaseModel):
    note: str = ""  # за что предупреждение (пойдёт нарушителю)


@router.post("/reports/{report_id}/warn")
def warn_report(
    report_id: str,
    body: WarnIn | None = None,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Мягкая мера между «закрыть» и «бан»: +1 предупреждение нарушителю и
    уведомление ему в бота. Жалоба закрывается."""
    rep = db.get(Report, report_id)
    if rep is None:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")
    offender = _offender_id(db, rep)
    if offender is None:
        raise HTTPException(status_code=400, detail="Некому выносить предупреждение")
    target = db.get(User, offender) or db.get(Employer, offender)
    if target is None:
        raise HTTPException(status_code=404, detail="Нарушитель не найден")
    target.warnings += 1
    rep.status = "reviewed"
    db.commit()
    note = (body.note.strip() if body else "") or "нарушение правил сервиса"
    notify_owner(
        db, offender,
        f"⚠️ Предупреждение от модерации StaffSwipe: {note}. "
        f"При повторных нарушениях — блокировка.",
    )
    return {"ok": True, "warnings": target.warnings}


def _resolve_reports_for(db: Session, target_id: str) -> None:
    """Закрыть все открытые жалобы на эту цель."""
    for r in db.query(Report).filter(
        Report.target_id == target_id, Report.status == "open"
    ).all():
        r.status = "reviewed"


class VerifyEmployerIn(BaseModel):
    verified: bool = True


@router.post("/employers/{employer_id}/verify")
def set_employer_verified(
    employer_id: str,
    body: VerifyEmployerIn,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Поставить или снять заведению бейдж «Проверено».

    Бейдж виден работнику в ленте ДО отклика и означает ровно одно: оператор
    сервиса лично убедился, что заведение существует и работает. Автоматически
    его выдать нельзя — ИНН публичен, и «нашёлся в справочнике» доказывает
    только умение гуглить. Раньше поставить бейдж не мог никто вообще: во всём
    коде не было ни одной строки, где он выдаётся, а интерфейс при этом обещал
    его «после оплаты верификации» — то есть продавал несуществующую услугу.

    При ручной правке названия или ИНН бейдж слетает сам (см. social.py) —
    иначе проверенным оказывалось бы любое новое название.
    """
    emp = db.get(Employer, employer_id)
    if emp is None:
        raise HTTPException(status_code=404, detail="Заведение не найдено")
    emp.verified = bool(body.verified)
    db.commit()
    if emp.verified:
        notify_owner(
            db, emp.id,
            "Ваше заведение проверено оператором StaffSwipe ✓ "
            "Теперь работники видят у вас значок «Проверено».",
        )
    return {"ok": True, "verified": emp.verified}


def _other_role(db: Session, target):
    """Вторая роль того же человека: вход один (Telegram), а ролей две.

    Один человек МОЖЕТ иметь обе роли — владелец кафе сам иногда выходит на
    смену, это нормально. Но бан выписывают человеку, а не роли: без этой
    связки забаненное заведение просто входило соискателем тем же Telegram и
    продолжало работать. Долг так не переносится (он на заведении), а бан —
    переносится, потому что это про поведение.
    """
    if target.tg_id is None:
        return None
    # Аккаунт оператора второй ролью не трогаем: доступ в админку выдаётся по
    # tg_id, и бан заведения, совладелец которого — сам оператор, запирал бы
    # его снаружи собственной панели.
    admins = {x.strip() for x in settings.admin_tg_ids.split(",") if x.strip()}
    if str(target.tg_id) in admins:
        return None
    table = Employer if isinstance(target, User) else User
    return db.query(table).filter(table.tg_id == target.tg_id).first()


@router.post("/users/{user_id}/block")
def block_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Заблокировать соискателя или работодателя (бан мошенника).

    Блокируем обе роли этого Telegram-аккаунта — см. `_other_role`.
    """
    target = db.get(User, user_id) or db.get(Employer, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    also = _other_role(db, target)
    for who in (target, also):
        if who is None:
            continue
        who.blocked = True
        # Если это работодатель — снимаем и его вакансии.
        if isinstance(who, Employer):
            for v in db.query(Vacancy).filter(
                Vacancy.employer_id == who.id
            ).all():
                v.status = "blocked"
        _resolve_reports_for(db, who.id)
    db.commit()
    return {"ok": True, "blocked": True, "alsoBlocked": also.id if also else None}


@router.post("/vacancies/{vacancy_id}/block")
def block_vacancy(
    vacancy_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Снять вакансию (фейк/обман) — она исчезает из ленты."""
    v = db.get(Vacancy, vacancy_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    v.status = "blocked"
    _resolve_reports_for(db, vacancy_id)
    db.commit()
    return {"ok": True, "blocked": True}


@router.post("/users/{user_id}/unblock")
def unblock_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Снять блокировку с пользователя (отмена ошибочного бана).

    Снимаем с обеих ролей — блокировали тоже обе.
    """
    target = db.get(User, user_id) or db.get(Employer, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    target.blocked = False
    also = _other_role(db, target)
    if also is not None:
        also.blocked = False
    # Возвращаем и смены. Блокировка заведения снимала все его смены с
    # публикации, а разблокировка их не возвращала: заведение снова входило,
    # видело свои смены у себя в списке, а в ленте их не было и откликов не
    # приходило — понять причину изнутри приложения невозможно.
    # Только не прошедшие: воскрешать вчерашние смены смысла нет.
    restored = 0
    if isinstance(target, Employer):
        restored = (
            db.query(Vacancy)
            .filter(
                Vacancy.employer_id == user_id,
                Vacancy.status == "blocked",
                Vacancy.date >= local_today(),
            )
            .update({Vacancy.status: "active"}, synchronize_session=False)
        )
    db.commit()
    return {"ok": True, "blocked": False, "restoredVacancies": int(restored)}


@router.post("/vacancies/{vacancy_id}/unblock")
def unblock_vacancy(
    vacancy_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Вернуть вакансию в ленту."""
    v = db.get(Vacancy, vacancy_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Вакансия не найдена")
    v.status = "active"
    db.commit()
    return {"ok": True, "blocked": False}


class BlockedOut(BaseModel):
    type: str  # user|employer|vacancy
    id: str
    info: str


@router.get("/blocked", response_model=list[BlockedOut])
def list_blocked(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    """Заблокированные пользователи и снятые вакансии — для разблокировки."""
    out: list[BlockedOut] = []
    for u in db.query(User).filter(User.blocked.is_(True)).limit(100).all():
        out.append(BlockedOut(type="user", id=u.id, info=u.name or "Соискатель"))
    for e in db.query(Employer).filter(Employer.blocked.is_(True)).limit(100).all():
        out.append(
            BlockedOut(type="user", id=e.id, info=e.company_name or "Заведение")
        )
    for v in db.query(Vacancy).filter(Vacancy.status == "blocked").limit(100).all():
        out.append(BlockedOut(
            type="vacancy", id=v.id, info=f"{role_ru(v.role)} · {v.rate} ₽"))
    return out


class PurchaseOut(BaseModel):
    id: str
    ownerId: str
    sku: str
    provider: str
    amount: int
    currency: str
    status: str
    createdAt: str


@router.get("/purchases", response_model=list[PurchaseOut])
def list_purchases(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    """Журнал платежей — чтобы видеть, что и кому возвращать."""
    rows = (
        db.query(Purchase)
        .order_by(Purchase.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        PurchaseOut(
            id=p.id, ownerId=p.owner_id, sku=p.sku, provider=p.provider,
            amount=p.amount, currency=p.currency, status=p.status,
            createdAt=p.created_at.isoformat(),
        )
        for p in rows
    ]


class DisputeMessageOut(BaseModel):
    """Одно сообщение переписки — так, как его читает оператор."""

    id: str
    who: str        # «Работник Мария», «Кофейня «Дрова»», «Система»
    side: str       # seeker | employer | system — для раскраски
    text: str
    at: str         # «16.08 23:40» по времени города смены


@router.get(
    "/matches/{match_id}/messages",
    response_model=list[DisputeMessageOut],
)
def dispute_chat(
    match_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Переписка по смене — то, по чему оператор разбирает спор.

    До этого её не было видно НИГДЕ. Жалобы бывают ровно про написанное —
    «мошенничество», «абьюз», «спам», а цель жалобы так и называется:
    «переписка по мэтчу». Оператор открывал такую жалобу и видел всё, кроме
    самой переписки: имена, дату смены, код прихода — и ни одного сообщения.
    Решение приходилось принимать по одному лишь тексту заявителя.

    Открываем не любую переписку, а только ту, на которую пожаловались или по
    которой идёт спор. Это личная переписка двух людей: у оператора не должно
    быть возможности читать чужие разговоры просто так. Отказ — 403, а не
    пустой список: пустой список выглядел бы как «там ничего нет».
    """
    m = db.get(Match, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Смена не найдена")

    complained = (
        db.query(Report).filter(Report.target_id == match_id).first() is not None
    )
    if not (m.disputed or complained):
        raise HTTPException(
            status_code=403,
            detail="Переписку можно открыть только по жалобе или спору.",
        )

    vac = db.get(Vacancy, m.vacancy_id)
    tz = business_tz(vac.city if vac is not None else "")
    worker = db.get(User, m.user_id)
    venue = db.get(Employer, m.employer_id)
    worker_name = (worker.name if worker is not None else "") or "Работник"
    venue_name = (venue.company_name if venue is not None else "") or "Заведение"

    rows = (
        db.query(Message)
        .filter(Message.match_id == match_id)
        .order_by(Message.created_at, Message.id)
        .limit(_DISPUTE_CHAT_MAX)
        .all()
    )
    out: list[DisputeMessageOut] = []
    for msg in rows:
        if msg.is_system:
            side, who = "system", "Система"
        elif msg.sender_id == m.user_id:
            side, who = "seeker", worker_name
        else:
            side, who = "employer", venue_name
        # Время — по городу смены: оператор в Москве, а смена может быть во
        # Владивостоке, и «23:40» там означает совсем другое.
        at = msg.created_at
        if at.tzinfo is None:
            at = at.replace(tzinfo=UTC)
        out.append(DisputeMessageOut(
            id=msg.id,
            who=who,
            side=side,
            text=msg.text,
            at=at.astimezone(tz).strftime("%d.%m %H:%M"),
        ))
    return out


class JobHealthOut(BaseModel):
    """Состояние ежедневной задачи: когда отработала в последний раз."""

    id: str
    title: str
    lastRun: str      # «ГГГГ-ММ-ДД» или пусто, если не отрабатывала никогда
    daysAgo: int      # 0 — сегодня; -1 — не отрабатывала ни разу
    stale: bool       # пропущена хотя бы день — надо вмешаться


_JOB_TITLES = {
    "reminders": "Напоминания о сменах",
    "aftershift": "Вопрос про вчерашние смены",
    "settle": "Закрытие смен и комиссия",
    "unfilled": "Смены без людей",
    "reconcile": "Сверка платежей",
}


@router.get("/jobs", response_model=list[JobHealthOut])
def jobs_health(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    """Работает ли планировщик.

    Самая тихая поломка во всём сервисе. Планировщик — отдельный процесс, и
    если он просто перестанет запускаться (упал контейнер, забыли поднять
    после обновления), НИЧЕГО не сломается на вид: приложение работает, смены
    публикуются, люди переписываются. Не будет только одного — закрытия смен.
    А значит и комиссии: ни рубля, и никто об этом не узнает.

    Хуже того, через две недели такие смены закрываются как «слишком старые»
    уже без денег — то есть выручка за простой не догоняется никогда.

    Отметки о выполнении в базе были всегда, но их никто не читал. Теперь
    оператор видит их на первом же экране.
    """
    from ..scheduler import SCHEDULE

    today = date.fromisoformat(local_today())
    out: list[JobHealthOut] = []
    for _h, _m, name in SCHEDULE:
        last = (
            db.query(JobRun.day)
            .filter(JobRun.job == name)
            .order_by(JobRun.day.desc())
            .first()
        )
        if last is None:
            out.append(JobHealthOut(
                id=name, title=_JOB_TITLES.get(name, name),
                lastRun="", daysAgo=-1, stale=True,
            ))
            continue
        try:
            ago = (today - date.fromisoformat(last[0])).days
        except ValueError:
            ago = -1
        out.append(JobHealthOut(
            id=name, title=_JOB_TITLES.get(name, name),
            lastRun=last[0], daysAgo=ago,
            # Сегодня задача могла ещё не наступить по времени — поэтому
            # тревога только со вчерашнего дня.
            stale=ago < 0 or ago > 1,
        ))
    return out
