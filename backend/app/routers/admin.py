"""Админ-панель: контроль жалоб, подписок и ключевых метрик.

Доступ — только Telegram-id из ADMIN_TG_IDS. На пилоте этого достаточно вместо
полноценной back-office системы.
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
    activePro: int
    activeBusiness: int
    estMonthlyRub: int  # оценка дохода в месяц по активным подпискам
    totalPaidRub: int   # всего получено рублями (за всё время)
    totalStars: int     # всего получено Telegram Stars


# Месячные цены тарифов — для оценки регулярного дохода.
_PLAN_RUB = {"pro": 1990, "business": 4990}


@router.get("/revenue", response_model=RevenueOut)
def revenue(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    def _subs(plan: str) -> int:
        return (
            db.query(func.count(Subscription.id))
            .filter(Subscription.active.is_(True), Subscription.plan == plan)
            .scalar()
            or 0
        )

    def _sum(currency: str) -> int:
        # Пополнения баланса — аванс (обязательство), не выручка: исключаем,
        # чтобы «Всего получено» не завышалось.
        return int(
            db.query(func.coalesce(func.sum(Purchase.amount), 0))
            .filter(
                Purchase.status == "paid",
                Purchase.currency == currency,
                Purchase.sku != "wallet_topup",
            )
            .scalar()
            or 0
        )

    pro, business = _subs("pro"), _subs("business")
    return RevenueOut(
        activePro=pro,
        activeBusiness=business,
        estMonthlyRub=pro * _PLAN_RUB["pro"] + business * _PLAN_RUB["business"],
        totalPaidRub=_sum("RUB"),
        totalStars=_sum("XTR"),
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


@router.post("/subscriptions/{owner_id}/cancel")
def cancel_subscription(
    owner_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Отозвать подписку (после возврата денег в ЮKassa) — доступ падает на Free
    и снимается платный бейдж «Проверен»."""
    subs = (
        db.query(Subscription).filter(Subscription.owner_id == owner_id).all()
    )
    if not subs:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    for sub in subs:
        sub.active = False
        sub.plan = "free"
    # Снимаем и одноразовый платный перк (верификацию), чтобы возврат не оставлял
    # оплаченные привилегии.
    ent = get_or_create(db, owner_id)
    ent.employer_verified = False
    db.commit()
    return {"ok": True, "plan": "free"}


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
    sku: str


@router.post("/grant")
def grant_entitlement(
    body: GrantIn,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Бесплатно выдать буст/подписку/супер-лайки (комп заведению, поддержка).
    Переиспользует ту же логику начисления, что и оплата."""
    from .billing import CATALOG, _apply_effect

    if body.sku not in CATALOG:
        raise HTTPException(status_code=400, detail="Неизвестный SKU")
    _apply_effect(db, body.owner_id, body.sku)
    return {"ok": True, "sku": body.sku}


# ---- Комиссия за закрытые смены (для выставления счёта заведениям) ----


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
