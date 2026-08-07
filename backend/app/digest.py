"""Дайджест свежих смен и напоминания о смене.

Чистая логика выбора получателей/сообщений (тестируется без бота) + отправка
через notify_owner (тихий no-op без токена). В проде вызывается планировщиком
(cron): `build_*` собирает, `send_*` рассылает.
"""
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from .models import Match, Swipe, User, Vacancy
from .notify import notify_owner


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


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
            picked.append(f"{v.role} · {v.rate}₽ · {v.date}")
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
        notify_owner(db, user_id, text, open_app="Я на смене — отметиться")
        m = db.get(Match, match_id)
        if m is not None:
            m.reminded_on = today
    db.commit()
    return len(reminders)


def _shift_end(v: Vacancy) -> datetime:
    """Момент окончания смены в UTC. Ночная смена (20:00→04:00) заканчивается
    на следующий день — иначе закрывали бы её на сутки раньше срока."""
    day = datetime.strptime(v.date, "%Y-%m-%d").replace(tzinfo=UTC)
    end = v.end_time if v.end_time > v.start_time else v.end_time + 1440
    return day + timedelta(minutes=end)


# Сколько ждём подтверждения заведения, прежде чем закрыть смену самим.
AUTO_CLOSE_AFTER_HOURS = 12


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
