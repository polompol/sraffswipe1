"""Тест логики стрика (серии заходов)."""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Streak
from app.streaks import touch_streak


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
        s.last_active = (datetime.now(UTC).date() - timedelta(days=1)).isoformat()
        db.commit()
        assert touch_streak(db, uid) == 2
        # Пропуск дня → сброс на 1.
        s = db.get(Streak, uid)
        s.last_active = (datetime.now(UTC).date() - timedelta(days=3)).isoformat()
        db.commit()
        assert touch_streak(db, uid) == 1
    finally:
        db.close()
