"""Время смен считается по местному часовому поясу, а не по часам сервера.

Смена — это «8 августа, 10:00–18:00» по Москве. Сервер живёт в UTC (так
настроены все хостинги), и разница в три часа делает вот что:

- с 21:00 до 24:00 UTC в Москве уже следующий день. Напоминание «сегодня
  смена» уходило по вчерашнему списку, лента отдавала не тот день;
- окончание смены считалось так, будто 18:00 — это 18:00 UTC. На деле это
  15:00 UTC, то есть авто-закрытие срабатывало на три часа позже обещанных
  двенадцати. В оферте написано «через 12 часов» — значит должно быть 12.

Здесь одно место, где местное время превращается в даты и моменты; всё
остальное пользуется этими функциями и про часовые пояса не думает.
"""
from datetime import UTC, datetime, timedelta, timezone

from .config import settings

# Москва не переводит часы с 2014 года, поэтому запасной вариант —
# фиксированный +03:00. Он нужен, если в образе не окажется базы часовых
# поясов: лучше правильное смещение, чем молчаливый возврат к UTC.
_FALLBACK = timezone(timedelta(hours=3))


def business_tz() -> timezone:
    """Часовой пояс, в котором люди читают время смены."""
    name = (settings.business_tz or "").strip()
    if not name:
        return _FALLBACK
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)  # type: ignore[return-value]
    except Exception:
        return _FALLBACK


def local_now() -> datetime:
    """Текущий момент в местном времени."""
    return datetime.now(UTC).astimezone(business_tz())


def local_today() -> str:
    """Сегодняшняя дата глазами человека в Москве, ISO yyyy-mm-dd."""
    return local_now().date().isoformat()


def shift_end_utc(date: str, start_time: int, end_time: int) -> datetime:
    """Момент окончания смены в UTC.

    `date` и минуты от полуночи — местное время. Ночная смена (20:00→04:00)
    заканчивается на следующий день, иначе закрывали бы её на сутки раньше.
    Бросает ValueError на некорректной дате — вызывающий решает, что делать.
    """
    day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=business_tz())
    end = end_time if end_time > start_time else end_time + 1440
    return (day + timedelta(minutes=end)).astimezone(UTC)
