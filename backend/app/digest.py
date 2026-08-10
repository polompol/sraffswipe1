"""Дайджест свежих смен и напоминания о смене.

Чистая логика выбора получателей/сообщений (тестируется без бота) + отправка
через notify_owner (тихий no-op без токена). В проде вызывается планировщиком
(cron): `build_*` собирает, `send_*` рассылает.
"""
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Match, Swipe, User, Vacancy
from .notify import notify_owner
from .roles import date_ru, role_ru
from .timeutil import local_today, shift_end_utc


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
            + ".\n\nКогда придёте — отметьтесь: кнопка ниже, «Я на смене». "
            "Гео определится само, либо введите код, который назовёт "
            "заведение. Без отметки смена не закроется."
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


# Сколько ждём подтверждения заведения, прежде чем закрыть смену самим.
AUTO_CLOSE_AFTER_HOURS = 12


# Сколько ждём после смены, прежде чем признать её брошенной. Больше, чем
# авто-закрытие: там есть доказательство выхода (код), здесь доказательств нет
# вообще, и спешить некуда — дадим людям сутки на то, чтобы вспомнить.
ABANDONED_AFTER_HOURS = 48


def close_abandoned_shifts(db: Session) -> int:
    """Закрыть смены, которые не отметила НИ ОДНА сторона.

    Такие смены висели в статусе «подтверждена» вечно. Последствия копились
    молча: место на смене оставалось занятым, и заведение не могло взять на
    него другого человека даже через месяц; список мэтчей засорялся мёртвыми
    записями; надёжность работника не обновлялась никогда.

    Ставим отдельный статус «expired», а НЕ неявку: доказательств нет ни у
    кого. Может, человек вышел и оба забыли нажать кнопку. Наказывать по
    догадке нельзя — поэтому надёжность не трогаем и комиссию не начисляем.
    Заведение, которому это важно, откроет спор.
    """
    from .routers.matches import _sys

    deadline = datetime.now(UTC) - timedelta(hours=ABANDONED_AFTER_HOURS)
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            Match.status == "confirmed",
            Match.seeker_checked_in.is_(False),
            Match.employer_checked_in.is_(False),
            Match.disputed.is_(False),
        )
        .all()
    )
    closed = 0
    for m, v in rows:
        try:
            if _shift_end(v) > deadline:
                continue
        except ValueError:
            continue
        m.status = "expired"
        _sys(
            db, m.id,
            "Смену не отметила ни одна сторона — она закрыта без начисления "
            "комиссии. Если смена была, откройте спор: оператор разберётся.",
        )
        notify_owner(
            db, m.employer_id,
            "Смена закрыта: её не отметил никто. Комиссия не начислена, "
            "место освободилось. Если человек выходил — откройте спор.",
        )
        closed += 1
    db.commit()
    return closed


def auto_close_shifts(db: Session) -> int:
    """Закрыть смены, где работник отметился КОДОМ, а заведение молчит.

    Оператор в споре всё равно решает по правилу «код знал только
    работодатель → раз код введён, работник был на месте → засчитать».
    Правило однозначное, значит его должен исполнять код, а не человек:
    это снимает самый частый класс споров и разгружает оператора.

    Гео-отметка сюда НЕ попадает: рядом с кафе можно оказаться и не работая.
    Спорные смены тоже не трогаем — их разбирает оператор.
    """
    from .routers.matches import _accrue_commission, _sys

    deadline = datetime.now(UTC) - timedelta(hours=AUTO_CLOSE_AFTER_HOURS)
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            Match.status == "confirmed",
            Match.seeker_checked_in.is_(True),
            Match.checkin_by_code.is_(True),
            Match.employer_checked_in.is_(False),
            Match.disputed.is_(False),
        )
        .all()
    )
    closed = 0
    for m, v in rows:
        try:
            if _shift_end(v) > deadline:
                continue
        except ValueError:  # некорректная дата в вакансии — пропускаем
            continue
        m.status = "completed"
        m.no_show = False
        m.employer_checked_in = True
        _accrue_commission(db, m)
        _sys(
            db, m.id,
            "Смена закрыта автоматически: работник отметился кодом заведения, "
            f"подтверждения не было {AUTO_CLOSE_AFTER_HOURS} часов. "
            "Если это ошибка — напишите в поддержку.",
        )
        notify_owner(db, m.employer_id,
                     "Смена закрыта автоматически: работник отметился вашим "
                     "кодом, а подтверждения не поступило. Комиссия начислена.")
        notify_owner(db, m.user_id,
                     "Ваша смена закрыта ✓ Заведение не подтвердило вовремя, "
                     "но код прихода это подтверждает.")
        closed += 1
    db.commit()
    return closed
