"""Перемотать смену в прошлое — одинаково для всех тестов.

Закрыть смену, отметить неявку и уточнить часы можно только ПОСЛЕ её
окончания, поэтому почти каждому тесту про закрытие нужно сначала довести
смену до конца.

Раньше каждый файл делал это сам: «дата = сегодня минус сутки», считая
сегодня по UTC. Но время смены живёт по Москве (+3): после 21:00 UTC
московская дата уже следующая, и «вчерашняя» смена оказывалась старше
суток. Правка фактических часов разрешена ровно сутки — и тесты про часы
начинали падать по вечерам, хотя код был исправен. Здесь дата подбирается по
самому концу смены, а не по календарю сервера.
"""
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models import Match, Vacancy
from app.timeutil import local_now, shift_end_utc


def age_shift(match_id: str, days: int = 0) -> None:
    """Сдвинуть смену мэтча так, чтобы она уже закончилась.

    `days=0` — закончилась в самом недавнем прошлом (все суточные окна ещё
    открыты). Больше нуля — и ещё столько суток назад: так проверяют
    просрочку, авто-закрытие и «слишком старую» смену.
    """
    db = SessionLocal()
    try:
        m = db.get(Match, match_id)
        v = db.get(Vacancy, m.vacancy_id)
        now = datetime.now(UTC)
        day = local_now().date() - timedelta(days=days)
        # Шаг назад по календарю, пока конец смены не окажется в прошлом.
        while shift_end_utc(day.isoformat(), v.start_time, v.end_time) >= now:
            day -= timedelta(days=1)
        v.date = day.isoformat()
        db.commit()
    finally:
        db.close()
