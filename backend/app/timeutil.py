"""Время смен считается по местному часовому поясу, а не по часам сервера.

Смена — это «8 августа, 10:00–18:00» ПО МЕСТУ, где она проходит. Сервер живёт
в UTC (так настроены все хостинги), и разница делает вот что:

- с 21:00 до 24:00 UTC в Москве уже следующий день. Напоминание «сегодня
  смена» уходило по вчерашнему списку, лента отдавала не тот день;
- окончание смены считалось так, будто 18:00 — это 18:00 UTC. На деле это
  15:00 UTC, то есть авто-закрытие срабатывало на три часа позже обещанных
  двенадцати. В оферте написано «через 12 часов» — значит должно быть 12.

Пока город был один, хватало одного пояса на весь сервис. С выходом в другие
города этого мало: смена «10:00–18:00» в Новосибирске заканчивается на четыре
часа раньше, чем думает московский сервер, а во Владивостоке — на семь. Все
функции здесь принимают город и берут его пояс из справочника (app/cities.py);
незнакомый город работает по поясу по умолчанию (BUSINESS_TZ).

Здесь одно место, где местное время превращается в даты и моменты; всё
остальное пользуется этими функциями и про часовые пояса не думает.
"""
from datetime import UTC, datetime, timedelta, timezone, tzinfo

from .cities import city_tz
from .config import settings

# Москва не переводит часы с 2014 года, поэтому запасной вариант —
# фиксированный +03:00. Он нужен, если в образе не окажется базы часовых
# поясов: лучше правильное смещение, чем молчаливый возврат к UTC.
_FALLBACK = timezone(timedelta(hours=3))


def _zone(name: str) -> tzinfo | None:
    if not name:
        return None
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except Exception:
        return None


def business_tz(city: str = "") -> tzinfo:
    """Часовой пояс, в котором люди читают время смены.

    `city` — город смены или человека. Пусто либо город не из справочника —
    берём пояс по умолчанию: так небольшой город продолжает работать, просто
    по московскому времени.
    """
    return (
        _zone(city_tz(city))
        or _zone((settings.business_tz or "").strip())
        or _FALLBACK
    )


def local_now(city: str = "") -> datetime:
    """Текущий момент в местном времени."""
    return datetime.now(UTC).astimezone(business_tz(city))


def local_today(city: str = "") -> str:
    """Сегодняшняя дата глазами человека в этом городе, ISO yyyy-mm-dd."""
    return local_now(city).date().isoformat()


def shift_start_utc(date: str, start_time: int, city: str = "") -> datetime:
    """Момент начала смены в UTC (`date` и минуты — местное время города)."""
    day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=business_tz(city))
    return (day + timedelta(minutes=start_time)).astimezone(UTC)


def shift_end_utc(
    date: str, start_time: int, end_time: int, city: str = ""
) -> datetime:
    """Момент окончания смены в UTC.

    `date` и минуты от полуночи — местное время города. Ночная смена
    (20:00→04:00) заканчивается на следующий день, иначе закрывали бы её на
    сутки раньше. Бросает ValueError на некорректной дате — вызывающий решает,
    что делать.
    """
    day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=business_tz(city))
    end = end_time if end_time > start_time else end_time + 1440
    return (day + timedelta(minutes=end)).astimezone(UTC)
