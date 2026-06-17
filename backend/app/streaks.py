"""Логика ежедневных серий (стриков) + награда за 7 дней."""
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from .entitlements import get_or_create
from .models import Streak


def touch_streak(db: Session, owner_id: str) -> int:
    """Обновляет серию при заходе. Возвращает текущее число дней подряд.

    +1 супер-лайк за каждые полные 7 дней серии.
    """
    today = datetime.now(UTC).date()
    s = db.get(Streak, owner_id)
    if s is None:
        s = Streak(owner_id=owner_id, count=1, last_active=today.isoformat())
        db.add(s)
        db.commit()
        return 1

    try:
        last = date.fromisoformat(s.last_active)
    except ValueError:
        last = None

    if last == today:
        return s.count  # уже заходил сегодня

    if last == today - timedelta(days=1):
        s.count += 1
    else:
        s.count = 1
    s.last_active = today.isoformat()

    # Награда на каждом 7-м дне.
    if s.count % 7 == 0:
        ent = get_or_create(db, owner_id)
        ent.superlike_balance += 1

    db.commit()
    return s.count
