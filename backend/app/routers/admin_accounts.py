"""Оператор: люди, деньги и аккаунты.

Вторая половина админки (первая — в admin.py): поиск людей, перенос аккаунта
на новый Telegram, пополнение и возврат по кошельку, комиссии и счета,
удаление по 152-ФЗ, задачи по расписанию.

Роутер отдельный, но префикс тот же — для оператора это по-прежнему одна
админка, разделение чисто внутреннее.
"""
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Commission,
    Employer,
    Entitlement,
    Event,
    Match,
    Report,
    Swipe,
    User,
    Vacancy,
    WalletTxn,
)
from ..notify import notify_owner
from .admin import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


# ---- Поиск пользователей и ручная выдача прав (комп/поддержка) ----


class AdminUserOut(BaseModel):
    id: str
    role: str
    name: str
    username: str | None = None
    blocked: bool
    warnings: int
    balanceRub: int = 0  # денежный баланс (аванс) заведения
    verified: bool = False  # бейдж «Проверено» (только у заведений)


def _admin_user_out(obj, role: str, balance: int) -> AdminUserOut:
    name = getattr(obj, "name", "") or getattr(obj, "company_name", "") or "—"
    return AdminUserOut(
        id=obj.id, role=role, name=name, username=obj.tg_username,
        blocked=obj.blocked, warnings=obj.warnings,
        balanceRub=balance,
        verified=bool(getattr(obj, "verified", False)),
    )


_SEARCH_LIMIT = 30


def _like(col, needle: str):
    """Поиск подстроки без учёта регистра — одинаково на SQLite и Postgres."""
    # Служебные символы LIKE экранируем: иначе запрос «%» находил бы всех, а
    # «_» — кого попало.
    safe = needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return func.lower(func.coalesce(col, "")).like(f"%{safe}%", escape="\\")


@router.get("/users", response_model=list[AdminUserOut])
def search_users(
    q: str = "",
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Быстрый поиск людей и заведений по имени/@нику/телефону.

    Раньше поиск вытягивал по 300 свежих записей людей и заведений и отсеивал
    лишнее уже в Python: человек, зарегистрировавшийся раньше этих трёхсот, не
    находился вообще — а именно старые аккаунты и ищет поддержка. Хуже другое:
    на КАЖДУЮ из шестисот строк создавалась (и сохранялась!) запись кошелька —
    обычный поиск писал в базу шестьсот раз. Теперь отбор делает сама база, а
    балансы дочитываются одним запросом и ничего не создают.
    """
    ql = q.strip().lower()
    res: list[AdminUserOut] = []

    users = db.query(User)
    emps = db.query(Employer)
    if ql:
        users = users.filter(
            or_(_like(User.name, ql), _like(User.tg_username, ql),
                _like(User.phone, ql))
        )
        emps = emps.filter(
            or_(_like(Employer.company_name, ql), _like(Employer.tg_username, ql),
                _like(Employer.phone, ql))
        )
    found_u = users.order_by(User.created_at.desc()).limit(_SEARCH_LIMIT).all()
    found_e = emps.order_by(Employer.created_at.desc()).limit(_SEARCH_LIMIT).all()

    # Балансы — одним запросом на всех. Нет записи кошелька = ноль на счету:
    # заводить её ради показа в поиске незачем.
    ids = [o.id for o in [*found_u, *found_e]]
    balances = {
        owner: bal
        for owner, bal in db.query(
            Entitlement.owner_id, Entitlement.balance_rub
        ).filter(Entitlement.owner_id.in_(ids or ["__none__"]))
    }
    for u in found_u:
        res.append(_admin_user_out(u, "seeker", balances.get(u.id, 0)))
    for e in found_e:
        res.append(_admin_user_out(e, "employer", balances.get(e.id, 0)))
    return res[:_SEARCH_LIMIT]


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


@router.post("/shifts/close-abandoned")
def ask_after_shift(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Спросить обе стороны про вчерашние смены: всё прошло как договаривались?

    Это единственное предупреждение перед тем, как за смену спишется
    комиссия. Планировщик шлёт его сам утром; кнопка — чтобы догнать вручную.
    """
    from ..digest import send_aftershift_asks

    return {"closed": send_aftershift_asks(db)}


@router.post("/shifts/unfilled-alerts")
def unfilled_alerts(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Предупредить заведения о завтрашних сменах без людей.

    Раньше заведение узнавало об этом утром в день смены, когда искать уже
    поздно. Запускать вечером, вместе с напоминаниями работникам.
    """
    from ..digest import send_unfilled_alerts

    return {"sent": send_unfilled_alerts(db)}


@router.post("/shifts/auto-close")
def settle_finished_shifts(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Закрыть состоявшиеся смены и начислить комиссию.

    Смена считается состоявшейся, если после её окончания никто не нажал
    «Смена не состоялась». Планировщик делает это сам днём; кнопка — чтобы
    догнать вручную, не дожидаясь расписания.
    """
    from ..digest import settle_shifts

    return {"closed": settle_shifts(db)}


class RepeatPairOut(BaseModel):
    """Пара «заведение ↔ работник», закрывшая больше одной смены."""

    employer: str
    worker: str
    shifts: int


class CancelStatRow(BaseModel):
    ownerId: str
    name: str
    role: str            # employer|seeker
    cancels: int         # всего отмен
    lateCancels: int     # из них поздних
    noShows: int         # неявок (для работника)
    # Сколько раз сторона заявила «смена не состоялась». Единственный способ
    # не платить за договорённую смену — значит он и должен быть на виду.
    # Раньше такое заявление не оставляло вообще НИКАКОГО следа: ни жалобы, ни
    # счётчика. Самый дешёвый обход правила «молчание = смена состоялась» —
    # попросить работника нажать эту кнопку.
    notHeld: int


@router.get("/cancel-stats", response_model=list[CancelStatRow])
def cancel_stats(
    days: int = 60,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Кто систематически отменяет смены.

    Одна отмена — жизнь. Пять поздних отмен за месяц — это уже поведение,
    из-за которого страдает вторая сторона: заведение остаётся без людей, а
    люди приезжают зря. Раньше такой паттерн можно было заметить только
    случайно, разбирая жалобы поштучно.

    Отдельно считаем поздние отмены: ранние — нормальная часть работы и сами
    по себе ни о чём не говорят.
    """
    from datetime import UTC, datetime, timedelta

    since = datetime.now(UTC) - timedelta(days=max(1, min(days, 365)))
    rows = (
        db.query(Match)
        .filter(
            Match.created_at >= since,
            or_(
                Match.status == "cancelled",
                Match.no_show.is_(True),
                Match.not_held_by != "",
            ),
        )
        .all()
    )
    blank = {"cancels": 0, "late": 0, "no_shows": 0, "not_held": 0}
    agg: dict[tuple[str, str], dict] = {}
    for m in rows:
        if m.status == "cancelled" and m.cancelled_by:
            key = (
                m.user_id if m.cancelled_by == "seeker" else m.employer_id,
                m.cancelled_by,
            )
            st = agg.setdefault(key, dict(blank))
            st["cancels"] += 1
            st["late"] += 1 if m.cancelled_late else 0
        if m.no_show:
            key = (m.user_id, "seeker")
            st = agg.setdefault(key, dict(blank))
            st["no_shows"] += 1
        if m.not_held_by:
            key = (
                m.user_id if m.not_held_by == "seeker" else m.employer_id,
                m.not_held_by,
            )
            st = agg.setdefault(key, dict(blank))
            st["not_held"] += 1

    out: list[CancelStatRow] = []
    for (owner_id, role), st in agg.items():
        obj = (db.get(User, owner_id) if role == "seeker"
               else db.get(Employer, owner_id))
        name = (getattr(obj, "name", None)
                or getattr(obj, "company_name", None) or "—")
        out.append(CancelStatRow(
            ownerId=owner_id, name=name, role=role,
            cancels=st["cancels"], lateCancels=st["late"],
            noShows=st["no_shows"], notHeld=st["not_held"],
        ))
    # Сначала те, кто подводит чаще: поздние отмены, неявки и заявления
    # «смены не было» весомее ранних отмен.
    out.sort(key=lambda r: -(
        r.lateCancels * 2 + r.noShows * 2 + r.notHeld * 2 + r.cancels
    ))
    return out[:50]


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


class WalletRefundIn(BaseModel):
    amount_rub: Annotated[int, Field(ge=1, le=500_000)]
    note: str = ""


@router.post("/wallet/{owner_id}/refund")
def wallet_refund(
    owner_id: str,
    body: WalletRefundIn,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Вернуть деньги с баланса (возврат заведению или исправление ошибки).

    До этого механизма возврата не было НИКАКОГО: ошиблись при зачислении —
    единственный путь правки лежал через прямой доступ к базе, где движение
    денег не оставляет следа в журнале. Теперь и списание тоже строка в
    wallet_txns: журнал остаётся полным.

    В минус не уходим: нельзя вернуть больше, чем на балансе. Списание —
    атомарным UPDATE с условием, как и все деньги в проекте.
    """
    from ..entitlements import ensure

    if db.get(Employer, owner_id) is None and db.get(User, owner_id) is None:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    ensure(db, owner_id)
    taken = (
        db.query(Entitlement)
        .filter(
            Entitlement.owner_id == owner_id,
            Entitlement.balance_rub >= body.amount_rub,
        )
        .update(
            {Entitlement.balance_rub: Entitlement.balance_rub - body.amount_rub},
            synchronize_session=False,
        )
    )
    if not taken:
        current = int(db.get(Entitlement, owner_id).balance_rub)
        raise HTTPException(
            status_code=409,
            detail=f"На балансе только {current} ₽ — вернуть больше нельзя.",
        )
    db.add(WalletTxn(
        owner_id=owner_id, amount=-body.amount_rub, kind="refund",
        note=(body.note or "Возврат оператором")[:200],
    ))
    db.commit()
    balance = int(db.get(Entitlement, owner_id).balance_rub)
    notify_owner(db, owner_id,
                 f"С баланса возвращено {body.amount_rub} ₽. "
                 f"Остаток — {balance} ₽.")
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


@router.post("/payments/reconcile")
def reconcile_payments(
    hours: int = 48,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Сверить платежи с ЮKassa и дозачислить те, по которым не дошёл вебхук.

    Запускать раз в сутки кроном. Без сверки непришедший вебхук означает:
    у ЮKassa деньги есть, у нас их нет, и никто об этом не узнает.
    """
    from ..reconcile import reconcile

    return reconcile(db, hours=max(1, min(hours, 24 * 30)))


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
    removed["рефералы"] = _drop(Referral, Referral.referrer_id == owner_id,
                                Referral.referred_id == owner_id)
    # Баланс обнуляем ПРОВОДКОЙ, а не удалением строки. Раньше строка прав
    # удалялась целиком: в журнале оставалось пополнение «+5000», а остатка и
    # списания не было — журнал переставал сходиться, и на просьбу вернуть
    # аванс доказать было нечем. Персональных данных здесь нет, под 152-ФЗ
    # удалять её и не требуется.
    ent = db.get(Entitlement, owner_id)
    left = int(ent.balance_rub) if ent is not None else 0
    if left:
        db.query(Entitlement).filter(
            Entitlement.owner_id == owner_id,
            Entitlement.balance_rub >= left,
        ).update(
            {Entitlement.balance_rub: Entitlement.balance_rub - left},
            synchronize_session=False,
        )
        db.add(WalletTxn(
            owner_id=owner_id, amount=-left, kind="erase",
            note="Обнуление баланса при удалении данных по заявлению",
        ))
    removed["обнулено с баланса, ₽"] = left
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

    # Сами файлы фотографий, а не только ссылки на них. Ссылка неугадываемая,
    # но закон говорит про хранение: пока файл лежит в бакете, фотография
    # человека хранится у нас.
    from ..photos import delete_stored_photos

    removed["файлы фото"] = delete_stored_photos(owner_id)

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
        target.roles = ""
        target.med_book = "no"
        target.self_employed = False
        target.inn = None
        target.experience_tags = ""
        target.photo_urls = ""
        target.about = ""
        target.available_date = ""
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


class WriteOffIn(BaseModel):
    reason: Annotated[str, Field(min_length=3, max_length=200)]
    match_id: str = ""   # пусто — списать весь долг заведения


@router.post("/commissions/{employer_id}/write-off")
def write_off_commission(
    employer_id: str,
    body: WriteOffIn,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Списать комиссию: простить спорную или признать долг безнадёжным.

    Раньше у оператора была одна кнопка — «Оплачено». И ею закрывали всё
    подряд: и реальную оплату, и прощённую после спора комиссию, и долг, за
    которым никто не пойдёт в суд из-за трёх тысяч. В отчёте всё это
    выглядело выручкой, которой не было.

    Списание — отдельный статус с обязательной причиной. В деньги сервиса
    оно не попадает, но остаётся в истории: видно, сколько и почему потеряли.
    """
    q = db.query(Commission).filter(
        Commission.employer_id == employer_id,
        Commission.status == "pending",
    )
    if body.match_id:
        q = q.filter(Commission.match_id == body.match_id)
    rows = q.all()
    if not rows:
        raise HTTPException(status_code=404, detail="Нет неоплаченных начислений")
    total = sum(c.amount for c in rows)
    for c in rows:
        c.status = "written_off"
        c.note = body.reason[:200]
    db.commit()
    notify_owner(db, employer_id,
                 f"Комиссия {total} ₽ списана оператором. Причина: "
                 f"{body.reason[:120]}")
    return {"ok": True, "written_off": len(rows), "amount_rub": total}
