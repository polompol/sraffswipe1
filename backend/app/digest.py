"""Дайджест свежих смен и напоминания о смене.

Чистая логика выбора получателей/сообщений (тестируется без бота) + отправка
через notify_owner (тихий no-op без токена). В проде вызывается планировщиком
(cron): `build_*` собирает, `send_*` рассылает.
"""
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Match, Swipe, User, Vacancy
from .notify import notify_owner
from .roles import date_ru, role_ru
from .timeutil import local_today, shift_end_utc

_log = logging.getLogger("staffswipe")


def _today() -> str:
    # Дата смены — местная. Считать её по часам сервера значит с 21:00 UTC
    # (полночь в Москве) напоминать людям про вчерашний день.
    return local_today()


def _fmt_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def build_digest(db: Session, limit: int = 3) -> dict[str, list[str]]:
    """Для каждого соискателя — до `limit` свежих активных смен в его городе,
    которые он ещё не свайпал. Возвращает {user_id: [тексты строк смен]}."""
    out: dict[str, list[str]] = {}
    users = db.query(User).filter(User.blocked.is_(False)).all()
    for u in users:
        if not u.city:
            continue
        city = u.city.strip().lower()
        swiped = {
            s.target_id
            for s in db.query(Swipe.target_id)
            .filter(Swipe.swiper_id == u.id, Swipe.target_type == "vacancy")
            .all()
        }
        vacs = (
            db.query(Vacancy)
            .filter(Vacancy.status == "active")
            .order_by(Vacancy.created_at.desc())
            .all()
        )
        picked: list[str] = []
        for v in vacs:
            if (v.city or "").strip().lower() != city:
                continue
            if v.id in swiped:
                continue
            # Должность по-русски и дата по-человечески: в базе лежит
            # «barista» и «2026-08-12», а в дайджест это уходило как есть.
            picked.append(f"{role_ru(v.role)} · {v.rate}₽ · {date_ru(v.date)}")
            if len(picked) >= limit:
                break
        if picked:
            out[u.id] = picked
    return out


def send_digest(db: Session, limit: int = 3) -> int:
    """Разослать дайджест. Возвращает число отправленных (для метрик/тестов)."""
    sent = 0
    for user_id, lines in build_digest(db, limit).items():
        text = "Свежие смены рядом:\n" + "\n".join(f"• {x}" for x in lines)
        notify_owner(db, user_id, text)
        sent += 1
    return sent


def build_reminders(db: Session) -> list[tuple[str, str, str]]:
    """Напоминания о сменах на сегодня: (match_id, user_id, текст).
    Берём только смены, по которым работник ЕЩЁ НЕ отметился, и по которым
    сегодня ещё не напоминали."""
    today = _today()
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            Match.status == "confirmed",
            Match.seeker_checked_in.is_(False),
            Match.reminded_on != today,
            Vacancy.date == today,
        )
        .all()
    )
    result: list[tuple[str, str, str]] = []
    for m, v in rows:
        where = v.address or v.city or ""
        text = (
            f"Сегодня смена в {_fmt_time(v.start_time)}"
            + (f", {where}" if where else "")
            + ".\n\nКогда придёте — попросите у администратора код и введите "
            "его в приложении. Это не обязательно, смена закроется и так, но "
            "код — ваше доказательство, что вы были на месте."
        )
        result.append((m.id, m.user_id, text))
    return result


def send_reminders(db: Session) -> int:
    """Разослать напоминания о сменах на сегодня. Возвращает число отправленных.

    Повторный запуск в тот же день ничего не дублирует: у мэтча проставляется
    дата напоминания. Поэтому вызывать можно и вручную из админки, и по крону.
    """
    today = _today()
    reminders = build_reminders(db)
    for match_id, user_id, text in reminders:
        notify_owner(db, user_id, text,
                     open_app="Я на смене — отметиться", screen="shifts")
        m = db.get(Match, match_id)
        if m is not None:
            m.reminded_on = today
    db.commit()
    return len(reminders)


def build_unfilled_alerts(db: Session) -> list[tuple[str, str, str]]:
    """Заведениям: «смена завтра, а людей нет». (vacancy_id, employer_id, текст).

    Заведение публикует смену и забывает про неё. Если откликов не было, оно
    узнаёт об этом утром в день смены — когда искать уже поздно. Никто об
    этом не предупреждал: напоминания были только работникам.

    Предупреждаем накануне — за день ещё можно поднять ставку, нажать
    «Срочно» или позвать знакомого.
    """
    from datetime import date
    from datetime import timedelta as _td

    try:
        tomorrow = (date.fromisoformat(local_today()) + _td(days=1)).isoformat()
    except ValueError:
        return []

    rows = (
        db.query(Vacancy)
        .filter(Vacancy.status == "active", Vacancy.date == tomorrow)
        .all()
    )
    if not rows:
        return []
    taken = {
        vid: n
        for vid, n in db.query(Match.vacancy_id, func.count(Match.id))
        .filter(
            Match.vacancy_id.in_([v.id for v in rows]),
            Match.status.in_(("matched", "confirmed", "completed")),
            Match.no_show.is_(False),
        )
        .group_by(Match.vacancy_id)
        .all()
    }
    out: list[tuple[str, str, str]] = []
    for v in rows:
        need = v.headcount or 1
        got = taken.get(v.id, 0)
        if got >= need:
            continue
        left = need - got
        who = "человека" if left == 1 else "человек"
        text = (
            f"Завтра смена в {_fmt_time(v.start_time)}"
            + (f", {v.address}" if v.address else "")
            + f" — не хватает {left} {who}.\n\n"
            "Что помогает за день до смены: поднять ставку, нажать «Срочно» "
            "(разошлём тем, кто готов выйти) или позвать своих через "
            "«Мои работники»."
        )
        out.append((v.id, v.employer_id, text))
    return out


def send_unfilled_alerts(db: Session) -> int:
    """Разослать предупреждения о незакрытых сменах на завтра."""
    alerts = build_unfilled_alerts(db)
    for _vid, employer_id, text in alerts:
        notify_owner(db, employer_id, text,
                     open_app="Открыть смену", screen="vacancies")
    return len(alerts)


def _shift_end(v: Vacancy) -> datetime:
    """Момент окончания смены в UTC (время смены — местное, см. timeutil)."""
    return shift_end_utc(v.date, v.start_time, v.end_time)


# Через сколько часов после конца смены она считается состоявшейся, если
# никто не сказал обратного. Смена вечером — расчёт на следующий день днём.
SETTLE_AFTER_HOURS = 12

# Насколько старую смену расчёт ещё готов закрыть. Дальше — молча оставляем
# оператору. Две причины. Первая: при включении новой механики в базе могут
# лежать подтверждённые смены за прошлые месяцы, и без этой границы первый же
# запуск выставил бы заведениям счёт сразу за всё. Вторая: спорить о смене
# двухнедельной давности бессмысленно — никто уже не помнит, как было.
SETTLE_MAX_AGE_DAYS = 14

# Через сколько часов после конца смены спрашиваем обе стороны «всё прошло как
# договаривались?». Раньше расчёта — чтобы возразить успели без спешки.
ASK_AFTER_HOURS = 2


def build_aftershift_asks(db: Session) -> list[tuple[str, str]]:
    """Пары (match_id, текст) — «вчера была смена, всё в порядке?».

    Единственное предупреждение перед тем, как за смену спишется комиссия.
    Без него авто-расчёт был бы неприятным сюрпризом: заведение узнавало бы о
    списании постфактум.
    """
    today = _today()
    deadline = datetime.now(UTC) - timedelta(hours=ASK_AFTER_HOURS)
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            Match.status == "confirmed",
            Match.disputed.is_(False),
            Match.settle_notified_on != today,
        )
        .all()
    )
    out: list[tuple[str, str]] = []
    for m, v in rows:
        try:
            if _shift_end(v) > deadline:
                continue
        except ValueError:
            continue
        out.append((
            m.id,
            f"Смена {date_ru(v.date)} в {_fmt_time(v.start_time)} завершилась.\n\n"
            "Если всё прошло как договаривались — делать ничего не нужно, "
            "смена закроется сама.\n"
            "Если смена не состоялась — откройте её и нажмите "
            "«Смена не состоялась», иначе она будет засчитана.",
        ))
    return out


def send_aftershift_asks(db: Session) -> int:
    """Разослать вопрос обеим сторонам. Повторов за день не будет."""
    today = _today()
    asks = build_aftershift_asks(db)
    for match_id, text in asks:
        m = db.get(Match, match_id)
        if m is None:
            continue
        for owner_id in (m.user_id, m.employer_id):
            # Сразу в нужную смену: в письме сказано «откройте её и нажмите»,
            # а кнопка вела в общий список — человек искал смену сам, и это
            # единственный шанс возразить до начисления комиссии.
            notify_owner(db, owner_id, text,
                         open_app="Открыть смену", screen="chat",
                         ident=match_id)
        m.settle_notified_on = today
    db.commit()
    return len(asks)


def settle_shifts(db: Session) -> int:
    """Закрыть состоявшиеся смены и начислить комиссию.

    Главное правило сервиса, и оно намеренно перевёрнуто по сравнению с тем,
    как было. Раньше смена закрывалась ТОЛЬКО когда обе стороны нажимали
    кнопку — значит, чтобы не платить 10%, заведению достаточно было ничего
    не нажимать и не называть работнику код прихода. Сторона, которая должна
    деньги, выигрывала от бездействия, и никакая отметка (ни код, ни
    геолокация) этого не лечила: код тоже давало заведение.

    Теперь: договорились о смене — смена считается состоявшейся, пока кто-то
    явно не сказал обратного кнопкой «Смена не состоялась». Молчание больше
    не бесплатно.

    Не трогаем: спорные смены (их решает оператор) и те, по которым уже
    заявили, что смены не было.
    """
    from .routers.matches import _accrue_commission, _sys

    now = datetime.now(UTC)
    deadline = now - timedelta(hours=SETTLE_AFTER_HOURS)
    too_old = now - timedelta(days=SETTLE_MAX_AGE_DAYS)
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            Match.status == "confirmed",
            Match.disputed.is_(False),
            Match.not_held_by == "",
        )
        .all()
    )
    closed = 0
    for m, v in rows:
        try:
            ends = _shift_end(v)
        except ValueError:  # некорректная дата в вакансии — пропускаем
            continue
        if ends > deadline:
            continue
        if ends < too_old:
            # Слишком старая: счёт задним числом за то, чего никто уже не
            # помнит, — верный способ поссориться с заведением. Закрываем без
            # комиссии, чтобы смена не висела вечно и не держала место.
            m.status = "expired"
            _sys(db, m.id,
                 "Смена закрыта без комиссии: с её окончания прошло слишком "
                 "много времени, чтобы разбираться автоматически.")
            continue
        m.status = "completed"
        m.no_show = False
        _accrue_commission(db, m)
        _sys(db, m.id, "Смена закрыта ✓ Возражений не поступило.")
        # Коммит на КАЖДУЮ смену, и только потом уведомления. Раньше был один
        # коммит на весь прогон, а сообщения улетали сразу: любой конфликт при
        # записи (например гонка с отметкой кодом, где на комиссию стоит
        # уникальный индекс) откатывал всю пачку — люди уже получили «смена
        # закрыта, комиссия начислена», а в базе не закрылось ничего, и назавтра
        # приходило второе такое же сообщение.
        try:
            db.commit()
        except Exception:  # noqa: BLE001 — одна смена не должна ронять прогон
            db.rollback()
            _log.exception("Не удалось закрыть смену %s", m.id)
            continue
        notify_owner(
            db, m.employer_id,
            "Смена закрыта — возражений не было. Комиссия начислена.",
        )
        notify_owner(
            db, m.user_id,
            "Смена закрыта ✓ В разделе «Смены» можно скачать акт "
            "и оценить заведение.",
            open_app="Открыть смены", screen="shifts",
        )
        closed += 1
    db.commit()
    return closed
