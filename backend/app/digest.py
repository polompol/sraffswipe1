"""Дайджест свежих смен и напоминания о смене.

Чистая логика выбора получателей/сообщений (тестируется без бота) + отправка
через notify_owner (тихий no-op без токена). В проде вызывается планировщиком
(cron): `build_*` собирает, `send_*` рассылает.
"""
from datetime import UTC, datetime

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


def build_reminders(db: Session) -> list[tuple[str, str]]:
    """Напоминания о подтверждённых сменах на сегодня: (user_id, текст)."""
    today = _today()
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            Match.status.in_(("confirmed", "completed")),
            Vacancy.date == today,
        )
        .all()
    )
    result: list[tuple[str, str]] = []
    for m, v in rows:
        text = (
            f"Сегодня смена в {_fmt_time(v.start_time)}. "
            f"Не забудьте — вас ждут! ({v.role}, {v.address or v.city})"
        )
        result.append((m.user_id, text))
    return result


def send_reminders(db: Session) -> int:
    """Разослать напоминания о смене на сегодня. Возвращает число отправленных."""
    reminders = build_reminders(db)
    for user_id, text in reminders:
        notify_owner(db, user_id, text)
    return len(reminders)
