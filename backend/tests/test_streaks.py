"""Тест логики стрика (серии заходов)."""
from datetime import date, timedelta

from app.db import SessionLocal
from app.models import Streak
from app.streaks import touch_streak
from app.timeutil import local_today


def _local(days: int) -> str:
    """День серии — местный: у сервера в UTC с 21:00 уже другая дата."""
    return (date.fromisoformat(local_today()) + timedelta(days=days)).isoformat()


def test_streak_increments_on_consecutive_days(client):
    # Логиним пользователя — стрик = 1.
    r = client.post("/auth/telegram", json={"init_data": "", "role": "seeker"})
    token = r.json()["access_token"]
    uid = r.json()["user_id"]
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).json()[
        "streak"
    ] == 1

    # Сдвигаем last_active на вчера и заходим снова → 2.
    db = SessionLocal()
    try:
        s = db.get(Streak, uid)
        s.last_active = _local(-1)
        db.commit()
        assert touch_streak(db, uid) == 2
        # Пропуск дня → сброс на 1.
        s = db.get(Streak, uid)
        s.last_active = _local(-3)
        db.commit()
        assert touch_streak(db, uid) == 1
    finally:
        db.close()
