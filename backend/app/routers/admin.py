"""Админ-панель: контроль жалоб, подписок и ключевых метрик.

Доступ — только Telegram-id из ADMIN_TG_IDS. На пилоте этого достаточно вместо
полноценной back-office системы.
"""
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..entitlements import get_or_create, plan_of
from ..models import (
    Commission,
    Employer,
    Event,
    Match,
    Purchase,
    Report,
    Subscription,
    Swipe,
    User,
    Vacancy,
)
from ..notify import notify_owner
from ..security import current_principal
from .analytics import _is_admin

router = APIRouter(prefix="/admin", tags=["admin"])

_POSITIVE = ("like", "superlike")


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
    activeSubscriptions: int


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
        activeSubscriptions=db.query(func.count(Subscription.id))
        .filter(Subscription.active.is_(True))
        .scalar()
        or 0,
    )


class RevenueOut(BaseModel):
    """Деньги сервиса. Модель одна — комиссия за закрытую смену."""

    commissionAccruedRub: int   # начислено за всё время
    commissionPaidRub: int      # из них оплачено
    commissionPendingRub: int   # к оплате сейчас
    shiftsBilled: int           # смен, за которые начислена комиссия
    topupsRub: int              # пополнений баланса (аванс, НЕ выручка)


@router.get("/revenue", response_model=RevenueOut)
def revenue(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    def _commission(status: str | None = None) -> int:
        q = db.query(func.coalesce(func.sum(Commission.amount), 0))
        if status:
            q = q.filter(Commission.status == status)
        return int(q.scalar() or 0)

    return RevenueOut(
        commissionAccruedRub=_commission(),
        commissionPaidRub=_commission("paid"),
        commissionPendingRub=_commission("pending"),
        shiftsBilled=int(db.query(func.count(Commission.id)).scalar() or 0),
        # Аванс — это обязательство перед заведением, а не заработок сервиса.
        topupsRub=int(
            db.query(func.coalesce(func.sum(Purchase.amount), 0))
            .filter(Purchase.status == "paid", Purchase.sku == "wallet_topup")
            .scalar()
            or 0
        ),
    )


class ReportOut(BaseModel):
    id: str
    targetType: str
    targetId: str
    targetInfo: str  # что именно на разборе (название вакансии/имя/…)
    reason: str
    text: str
    status: str
    createdAt: str


def _describe_target(db: Session, target_type: str, target_id: str) -> str:
    """Человекочитаемое описание цели жалобы — чтобы админ видел контент."""
    if target_type == "vacancy":
        v = db.get(Vacancy, target_id)
        if v is None:
            return "вакансия удалена"
        emp = db.get(Employer, v.employer_id)
        return f"{v.role} · {emp.company_name if emp else '—'} · {v.rate}₽"
    if target_type == "user":
        u = db.get(User, target_id) or db.get(Employer, target_id)
        return getattr(u, "name", None) or getattr(u, "company_name", None) or "—"
    return "переписка по мэтчу"


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


@router.post("/users/{user_id}/block")
def block_user(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Заблокировать соискателя или работодателя (бан мошенника)."""
    target = db.get(User, user_id) or db.get(Employer, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    target.blocked = True
    # Если это работодатель — снимаем и его вакансии.
    if isinstance(target, Employer):
        for v in db.query(Vacancy).filter(Vacancy.employer_id == user_id).all():
            v.status = "blocked"
    _resolve_reports_for(db, user_id)
    db.commit()
    return {"ok": True, "blocked": True}


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
    """Снять блокировку с пользователя (отмена ошибочного бана)."""
    target = db.get(User, user_id) or db.get(Employer, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    target.blocked = False
    db.commit()
    return {"ok": True, "blocked": False}


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
        out.append(BlockedOut(type="vacancy", id=v.id, info=f"{v.role} · {v.rate}₽"))
    return out


class SubscriptionOut(BaseModel):
    ownerId: str
    company: str
    plan: str
    renewsAt: str | None = None


@router.get("/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    rows = (
        db.query(Subscription)
        .filter(Subscription.active.is_(True))
        .order_by(Subscription.created_at.desc())
        .limit(200)
        .all()
    )
    out: list[SubscriptionOut] = []
    for s in rows:
        emp = db.get(Employer, s.owner_id)
        out.append(SubscriptionOut(
            ownerId=s.owner_id,
            company=emp.company_name if emp else "—",
            plan=s.plan,
            renewsAt=s.renews_at,
        ))
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


# ---- Поиск пользователей и ручная выдача прав (комп/поддержка) ----


class AdminUserOut(BaseModel):
    id: str
    role: str
    name: str
    username: str | None = None
    blocked: bool
    warnings: int
    plan: str
    boostBalance: int
    superlikeBalance: int
    balanceRub: int = 0  # денежный баланс (аванс) заведения


def _admin_user_out(db: Session, obj, role: str) -> AdminUserOut:
    ent = get_or_create(db, obj.id)
    name = getattr(obj, "name", "") or getattr(obj, "company_name", "") or "—"
    return AdminUserOut(
        id=obj.id, role=role, name=name, username=obj.tg_username,
        blocked=obj.blocked, warnings=obj.warnings,
        plan=plan_of(db, obj.id),
        boostBalance=ent.boost_balance,
        superlikeBalance=ent.superlike_balance,
        balanceRub=ent.balance_rub,
    )


@router.get("/users", response_model=list[AdminUserOut])
def search_users(
    q: str = "",
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Быстрый поиск людей и заведений по имени/@нику/телефону. Фильтруем в
    Python — корректно для кириллицы и на SQLite, и на Postgres."""
    ql = q.strip().lower()

    def _match(*vals: str | None) -> bool:
        return not ql or any(ql in (v or "").lower() for v in vals)

    res: list[AdminUserOut] = []
    for u in db.query(User).order_by(User.created_at.desc()).limit(300).all():
        if _match(u.name, u.tg_username, u.phone):
            res.append(_admin_user_out(db, u, "seeker"))
    for e in db.query(Employer).order_by(Employer.created_at.desc()).limit(300).all():
        if _match(e.company_name, e.tg_username, e.phone):
            res.append(_admin_user_out(db, e, "employer"))
    return res[:30]


class GrantIn(BaseModel):
    owner_id: str
    # Сколько выдать. Раньше выдавали «пакетами» из каталога товаров, но
    # каталога больше нет: платный рельс один — пополнение баланса. Оператор
    # компенсирует напрямую, без выдуманных SKU.
    boost: Annotated[int, Field(ge=0, le=100)] = 0
    superlikes: Annotated[int, Field(ge=0, le=100)] = 0


@router.post("/grant")
def grant_entitlement(
    body: GrantIn,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Компенсация от оператора: выдать буст и/или супер-лайки бесплатно."""
    if body.boost == 0 and body.superlikes == 0:
        raise HTTPException(status_code=400, detail="Нечего выдавать")
    ent = get_or_create(db, body.owner_id)
    ent.boost_balance += body.boost
    ent.superlike_balance += body.superlikes
    db.commit()
    return {
        "ok": True,
        "boostBalance": ent.boost_balance,
        "superlikeBalance": ent.superlike_balance,
    }


# ---- Комиссия за закрытые смены (для выставления счёта заведениям) ----


@router.post("/reminders/send")
def send_shift_reminders(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Разослать напоминания о сегодняшних сменах — с кнопкой «Я на смене».

    Раньше рассылка была написана, но её никто не вызывал: напоминания не
    уходили вообще. Повторный запуск в тот же день дублей не создаёт, поэтому
    кнопку можно жать спокойно, а позже повесить на крон.
    """
    from ..digest import send_reminders

    return {"sent": send_reminders(db)}


@router.post("/shifts/auto-close")
def auto_close_hanging_shifts(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Закрыть смены, где работник отметился кодом, а заведение промолчало.

    Раньше такие смены висели, работник открывал спор, и оператор звонил
    обеим сторонам — хотя правило разбора однозначное: код знало только
    заведение. Теперь правило исполняет код.
    """
    from ..digest import auto_close_shifts

    return {"closed": auto_close_shifts(db)}


class RepeatPairOut(BaseModel):
    """Пара «заведение ↔ работник», закрывшая больше одной смены."""

    employer: str
    worker: str
    shifts: int


@router.get("/repeat-pairs", response_model=list[RepeatPairOut])
def repeat_pairs(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    """Кто вернулся за второй сменой. Главный вопрос экономики: если пары
    закрывают одну смену и исчезают — люди договариваются мимо сервиса, и
    дело не в проценте комиссии, а в том, что дальше сервис не нужен."""
    rows = (
        db.query(
            Match.employer_id,
            Match.user_id,
            func.count(Match.id).label("shifts"),
        )
        .filter(Match.status == "completed")
        .group_by(Match.employer_id, Match.user_id)
        .having(func.count(Match.id) > 1)
        .order_by(func.count(Match.id).desc())
        .limit(50)
        .all()
    )
    emp_names = {
        e.id: e.company_name
        for e in db.query(Employer).filter(
            Employer.id.in_([r[0] for r in rows] or ["__none__"])
        )
    }
    usr_names = {
        u.id: u.name
        for u in db.query(User).filter(
            User.id.in_([r[1] for r in rows] or ["__none__"])
        )
    }
    return [
        RepeatPairOut(
            employer=emp_names.get(eid, "—"),
            worker=usr_names.get(uid, "—"),
            shifts=int(n),
        )
        for eid, uid, n in rows
    ]


class RelinkIn(BaseModel):
    owner_id: str
    new_tg_id: int


@router.post("/relink")
def relink_account(
    body: RelinkIn,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Перенос аккаунта на новый Telegram (человек потерял аккаунт/сменил
    телефон). История, рейтинг, смены и баланс сохраняются — меняется только
    привязка tg_id. Если новый tg_id уже занят свежесозданным дублем —
    дубль отвязывается и блокируется (его пустая история никому не нужна)."""
    # Защита от эскалации прав: перенос на tg_id админа отвязал бы аккаунт
    # оператора и сделал бы целевой аккаунт админом. Запрещено всегда.
    from ..config import settings

    admin_ids = {x.strip() for x in settings.admin_tg_ids.split(",") if x.strip()}
    if str(body.new_tg_id) in admin_ids:
        raise HTTPException(
            status_code=400,
            detail="Нельзя переносить аккаунт на Telegram-id администратора",
        )
    target = db.get(User, body.owner_id) or db.get(Employer, body.owner_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    for model in (User, Employer):
        dup = db.query(model).filter(model.tg_id == body.new_tg_id).first()
        if dup is not None and dup.id != target.id:
            dup.tg_id = None
            dup.blocked = True
            # Освобождаем телефон-заглушку tg:<id>, чтобы не мешал будущим входам.
            if (dup.phone or "").startswith("tg:"):
                dup.phone = f"tg:retired:{dup.id[:8]}"
    # Сначала отвязываем дубли в БД, потом занимаем tg_id/телефон целью —
    # иначе UPDATE цели упрётся в UNIQUE, пока дубль ещё держит значения.
    db.flush()
    old_tg = target.tg_id
    target.tg_id = body.new_tg_id
    if target.phone == f"tg:{old_tg}":
        target.phone = f"tg:{body.new_tg_id}"
    # Перенос делают, когда доступ к прежнему Telegram потерян — в том числе
    # когда телефон украли. Ранее выданные токены продолжали работать до конца
    # срока, то есть у прежнего владельца оставался вход. Обрываем все сессии.
    target.token_version = (target.token_version or 0) + 1
    db.commit()
    notify_owner(db, target.id,
                 "Аккаунт перенесён на этот Telegram ✓ Рейтинг, история смен "
                 "и баланс сохранены.")
    return {"ok": True}


class WalletCreditIn(BaseModel):
    amount_rub: int
    note: str = ""


@router.post("/wallet/{owner_id}/credit")
def wallet_credit(
    owner_id: str,
    body: WalletCreditIn,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Оператор зачисляет аванс на баланс заведения (принял перевод СБП/счёт).
    Дальше комиссия за смены списывается с баланса автоматически."""
    if not 1 <= body.amount_rub <= 500_000:
        raise HTTPException(status_code=400, detail="Сумма от 1 до 500 000 ₽")
    if db.get(Employer, owner_id) is None and db.get(User, owner_id) is None:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    from .billing import credit_wallet

    balance = credit_wallet(
        db, owner_id, body.amount_rub,
        (body.note or "Пополнение оператором (СБП/счёт)")[:200],
    )
    notify_owner(db, owner_id,
                 f"Баланс пополнен на {body.amount_rub} ₽. "
                 f"Теперь на счету {balance} ₽ — комиссия списывается сама.")
    return {"ok": True, "balanceRub": balance}


class SourceRow(BaseModel):
    source: str      # канал из ссылки t.me/<bot>?startapp=src_<канал>
    seekers: int     # регистраций работников
    employers: int   # регистраций заведений


@router.get("/sources", response_model=list[SourceRow])
def traffic_sources(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    """Откуда приходят регистрации (атрибуция рекламных каналов)."""
    rows = db.query(Event.props).filter(Event.name == "source").all()
    agg: dict[str, dict[str, int]] = {}
    for (props,) in rows:
        try:
            p = json.loads(props or "{}")
        except ValueError:
            continue
        src = str(p.get("src") or "").strip()
        if not src:
            continue
        bucket = agg.setdefault(src, {"seekers": 0, "employers": 0})
        key = "employers" if p.get("role") == "employer" else "seekers"
        bucket[key] += 1
    out = [
        SourceRow(source=src, seekers=b["seekers"], employers=b["employers"])
        for src, b in agg.items()
    ]
    out.sort(key=lambda r: -(r.seekers + r.employers))
    return out


class CommissionRow(BaseModel):
    employerId: str
    company: str
    shifts: int          # закрытых смен (к оплате)
    amountRub: int       # сумма комиссии к счёту, ₽


@router.get("/commissions", response_model=list[CommissionRow])
def commissions(
    db: Session = Depends(get_db), _admin: dict = Depends(require_admin)
):
    """Сколько каждое заведение должно по комиссии за закрытые смены (pending)."""
    rows = (
        db.query(
            Commission.employer_id,
            func.count(Commission.id),
            func.coalesce(func.sum(Commission.amount), 0),
        )
        .filter(Commission.status == "pending")
        .group_by(Commission.employer_id)
        .all()
    )
    out: list[CommissionRow] = []
    for emp_id, shifts, total in rows:
        emp = db.get(Employer, emp_id)
        out.append(CommissionRow(
            employerId=emp_id,
            company=emp.company_name if emp else "—",
            shifts=int(shifts or 0),
            amountRub=int(total or 0),
        ))
    out.sort(key=lambda r: -r.amountRub)
    return out


@router.post("/users/{owner_id}/logout-all")
def logout_all(
    owner_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Завершить все сессии аккаунта («потерял телефон»).

    До этого отозвать токен было нечем: срок жизни — дни, и всё это время
    нашедший телефон работал бы от лица человека. Блокировка аккаунта тоже
    обрывает доступ, но она наказание, а тут человек ни в чём не виноват.
    """
    target = db.get(User, owner_id) or db.get(Employer, owner_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    target.token_version = (target.token_version or 0) + 1
    db.commit()
    notify_owner(db, owner_id,
                 "Все сессии завершены. Откройте приложение заново — "
                 "вход произойдёт сам.")
    return {"ok": True}


class EraseOut(BaseModel):
    ok: bool
    kind: str          # user|employer
    removed: dict      # что и сколько удалено — оператору для ответа человеку


@router.post("/users/{owner_id}/erase", response_model=EraseOut)
def erase_account(
    owner_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Удаление персональных данных по заявлению (152-ФЗ, ст. 14).

    Политика обещает удалить данные по обращению, а инструкция оператору
    предлагала руками выполнить `DELETE FROM users` на боевой базе. Это и
    опасно (одна опечатка в WHERE — и стёрт не тот человек), и неверно:
    строку нельзя просто удалить, на неё ссылаются смены, переписка и
    начисленная комиссия — бухгалтерские записи, которые обязаны остаться.

    Поэтому не удаляем строку, а обезличиваем её: из профиля вычищается всё,
    по чему человека можно узнать, привязка к Telegram снимается (войти в
    этот аккаунт больше нельзя), а поведенческие данные — свайпы, избранное,
    сохранённые поиски, аналитика, жалобы — удаляются полностью.

    Операция идемпотентна: повторный вызов ничего не ломает.
    """
    from ..config import settings
    from ..models import (
        Entitlement,
        Favorite,
        Message,
        Referral,
        Review,
        SavedSearch,
        Streak,
    )

    target = db.get(User, owner_id)
    kind = "user"
    if target is None:
        target = db.get(Employer, owner_id)
        kind = "employer"
    if target is None:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Стереть аккаунт оператора — значит остаться без админки: доступ
    # выдаётся по tg_id, а мы его как раз снимаем. Запрещаем.
    admin_ids = {x.strip() for x in settings.admin_tg_ids.split(",") if x.strip()}
    if target.tg_id is not None and str(target.tg_id) in admin_ids:
        raise HTTPException(
            status_code=400, detail="Нельзя стирать аккаунт администратора"
        )

    removed: dict[str, int] = {}

    def _drop(model, *conditions) -> int:
        from sqlalchemy import or_
        cond = conditions[0] if len(conditions) == 1 else or_(*conditions)
        return db.query(model).filter(cond).delete(synchronize_session=False)

    removed["свайпы"] = _drop(Swipe, Swipe.swiper_id == owner_id,
                              Swipe.target_id == owner_id)
    removed["избранное"] = _drop(Favorite, Favorite.owner_id == owner_id)
    removed["сохранённые поиски"] = _drop(SavedSearch,
                                          SavedSearch.owner_id == owner_id)
    removed["события аналитики"] = _drop(Event, Event.owner_id == owner_id)
    removed["жалобы"] = _drop(Report, Report.reporter_id == owner_id)
    removed["серии заходов"] = _drop(Streak, Streak.owner_id == owner_id)
    removed["рефералы"] = _drop(Referral, Referral.referrer_id == owner_id,
                                Referral.referred_id == owner_id)
    removed["права/баланс"] = _drop(Entitlement, Entitlement.owner_id == owner_id)
    # Текст отзыва — свободный, там может быть что угодно про человека.
    # Оценку оставляем: она уже вошла в рейтинг второй стороны.
    removed["тексты отзывов"] = (
        db.query(Review)
        .filter(Review.rater_id == owner_id)
        .update({Review.text: ""}, synchronize_session=False)
    )
    # Переписка — доказательство в спорах по уже закрытым сменам, поэтому не
    # удаляем целиком, а обезличиваем содержимое сообщений этого человека.
    removed["сообщения"] = (
        db.query(Message)
        .filter(Message.sender_id == owner_id, Message.is_system.is_(False))
        .update({Message.text: "[сообщение удалено по заявлению]"},
                synchronize_session=False)
    )

    # Профиль: снимаем привязку к Telegram и вычищаем всё личное.
    # Телефон обязан остаться уникальным — ставим технический маркер.
    target.tg_id = None
    target.tg_username = None
    target.phone = f"erased:{owner_id[:12]}"
    target.blocked = True
    target.token_version = (target.token_version or 0) + 1  # токены не работают
    if kind == "user":
        target.name = "Профиль удалён"
        target.birth_date = ""
        target.city = ""
        target.district = ""
        target.lat = 0.0
        target.lng = 0.0
        target.roles = ""
        target.med_book = "no"
        target.self_employed = False
        target.inn = None
        target.experience_tags = ""
        target.photo_urls = ""
        target.about = ""
        target.available_today = False
    else:
        target.company_name = "Профиль удалён"
        target.inn = ""
        target.ogrn = ""
        target.address = ""
        target.lat = 0.0
        target.lng = 0.0
        target.contact_phone = ""
        target.photo_url = ""
        # Смены удалённого заведения нельзя оставлять в ленте: на них
        # откликаются, а отвечать уже некому.
        removed["смены сняты с публикации"] = (
            db.query(Vacancy)
            .filter(Vacancy.employer_id == owner_id, Vacancy.status == "active")
            .update({Vacancy.status: "blocked"}, synchronize_session=False)
        )

    db.commit()
    return EraseOut(ok=True, kind=kind,
                    removed={k: int(v) for k, v in removed.items()})


@router.post("/commissions/{employer_id}/settle")
def settle_commission(
    employer_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Отметить комиссию заведения как оплаченную (после оплаты по счёту)."""
    n = (
        db.query(Commission)
        .filter(Commission.employer_id == employer_id, Commission.status == "pending")
        .update({Commission.status: "paid"}, synchronize_session=False)
    )
    db.commit()
    if n:
        notify_owner(db, employer_id,
                     "Оплата комиссии получена, спасибо! Счёт закрыт ✓")
    return {"ok": True, "settled": n}
