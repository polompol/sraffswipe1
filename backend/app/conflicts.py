"""Пересечение смен у одного человека.

Ничто не мешало соискателю взять две смены на одно время. Физически он в двух
местах не будет — значит, одно заведение останется без человека и узнает об
этом в день смены, когда искать замену уже поздно.

Мы предупреждаем, а не запрещаем. Жёсткий запрет вредит в частом случае:
смену отменили или перенесли, человек хочет взять другую на то же время — и
упирается в стену, хотя ничего не нарушает. Решение оставляем за ним, но
показываем, что он делает.
"""
from sqlalchemy.orm import Session

from .models import Match, Vacancy
from .timeutil import shift_end_utc, shift_start_utc

# Статусы, в которых человек уже «занят» на смене. Неявка и спор не считаются:
# по ним человек свободен либо вопрос решает оператор.
BUSY = ("matched", "confirmed", "completed")


def _bounds(v: Vacancy):
    """Начало и конец смены в UTC. None, если дата битая."""
    try:
        return (
            shift_start_utc(v.date, v.start_time, v.city),
            shift_end_utc(v.date, v.start_time, v.end_time, v.city),
        )
    except (ValueError, TypeError):
        return None


def overlapping_shifts(
    db: Session, user_id: str, vacancy: Vacancy, exclude_match_id: str = ""
) -> list[Vacancy]:
    """Смены человека, которые пересекаются по времени с этой.

    Сравниваем абсолютные моменты в UTC, а не «дату и часы»: иначе ночная
    смена 22:00→06:00 не пересеклась бы с утренней следующего дня, хотя на
    деле человек ещё на первой.
    """
    target = _bounds(vacancy)
    if target is None:
        return []
    t_start, t_end = target

    # Берём только соседние дни — смена длиннее суток невозможна.
    day_before = (t_start.date().isoformat(), t_end.date().isoformat())
    rows = (
        db.query(Match, Vacancy)
        .join(Vacancy, Match.vacancy_id == Vacancy.id)
        .filter(
            Match.user_id == user_id,
            Match.status.in_(BUSY),
            Match.no_show.is_(False),
            Vacancy.id != vacancy.id,
        )
        .all()
    )
    out: list[Vacancy] = []
    for m, v in rows:
        if exclude_match_id and m.id == exclude_match_id:
            continue
        if v.date < min(day_before) or v.date > max(day_before):
            # Быстрая отсечка по дате: разные недели точно не пересекаются.
            if abs((t_start.date() - _safe_date(v.date)).days) > 1:
                continue
        other = _bounds(v)
        if other is None:
            continue
        o_start, o_end = other
        # Классическое условие пересечения отрезков.
        if t_start < o_end and o_start < t_end:
            out.append(v)
    return out


def _safe_date(iso: str):
    from datetime import date

    try:
        return date.fromisoformat(iso)
    except (ValueError, TypeError):
        return date(1970, 1, 1)
