"""Планировщик ежедневных задач сервиса.

Четыре действия держали сервис в порядке, но зависели от памяти оператора:
он должен был каждый день зайти в админку и нажать четыре кнопки. Уехал на
выходные — людям не пришли напоминания о сменах, заведения не узнали, что на
завтра никто не откликнулся, а закрытые по коду смены остались висеть.

Здесь то же самое делается само. Запускается отдельным процессом (сервис
`scheduler` в docker-compose.prod.yml) на том же образе, что и API: задачи
вызываются напрямую, без HTTP и без токенов администратора.

Ручные кнопки в админке остаются — ими удобно догнать что-то сразу, не
дожидаясь расписания. Повторный запуск ничего не ломает: каждая задача
идемпотентна, а факт выполнения за день записывается (см. `_already_ran`).
"""
import logging
import time
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import JobRun
from .timeutil import business_tz, local_today

_log = logging.getLogger("staffswipe.scheduler")

# Час и минута по времени бизнеса (BUSINESS_TZ), а не по UTC: «в 9 утра»
# означает девять утра там, где люди выходят на смены.
SCHEDULE: list[tuple[int, int, str]] = [
    (9, 0, "reminders"),   # утром — напомнить о сегодняшних сменах
    (9, 30, "aftershift"), # утром — спросить про вчерашние: всё прошло?
    (14, 0, "settle"),     # днём — закрыть вчерашние смены и начислить комиссию
    (19, 0, "unfilled"),   # вечером — предупредить о завтрашних без людей
    (4, 30, "reconcile"),  # ночью — сверить платежи с ЮKassa
]


def _run_job(db: Session, name: str) -> int:
    """Выполнить задачу по имени. Возвращает число затронутых записей."""
    from .digest import (
        send_aftershift_asks,
        send_reminders,
        send_unfilled_alerts,
        settle_shifts,
    )

    if name == "reminders":
        return send_reminders(db)
    if name == "unfilled":
        return send_unfilled_alerts(db)
    if name == "settle":
        return settle_shifts(db)
    if name == "aftershift":
        return send_aftershift_asks(db)
    if name == "reconcile":
        from .config import settings

        if not settings.yookassa_ready:
            return 0
        from .reconcile import reconcile

        # Ключ именно `restored`: «credited» такого ключа нет, и ночная
        # сверка всегда писала в журнал «выполнена: 0» — даже в ту ночь,
        # когда подобрала потерянный платёж. Единственный признак, что
        # вебхук не дошёл, выглядел как «ничего не произошло».
        return int(reconcile(db, hours=48).get("restored", 0))
    raise ValueError(f"неизвестная задача: {name}")


def _already_ran(db: Session, name: str, day: str) -> bool:
    """Задача уже отработала сегодня?

    Планировщик может перезапуститься (обновление, падение сервера) и снова
    попасть в то же время. Для рассылок это означало бы второе сообщение
    одному человеку — самый заметный вид «сервис глючит».

    Отметки лежат в своей таблице `job_runs`. Раньше они писались в общую
    таблицу событий, куда пишет и публичная ручка POST /events, — и любой
    желающий пятью запросами останавливал планировщик на сутки (см. модель
    JobRun).
    """
    return (
        db.query(JobRun)
        .filter(JobRun.job == name, JobRun.day == day)
        .first()
        is not None
    )


def _mark_ran(db: Session, name: str, day: str) -> None:
    """Отметить выполнение. Повторная отметка — не ошибка: уникальность
    (job, day) страхует от двух параллельных планировщиков."""
    db.add(JobRun(job=name, day=day))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def run_due(now: datetime | None = None) -> list[tuple[str, int]]:
    """Выполнить задачи, время которых наступило. Возвращает [(задача, N)]."""
    now = now or datetime.now(business_tz())
    day = local_today()
    done: list[tuple[str, int]] = []
    db = SessionLocal()
    try:
        for hour, minute, name in SCHEDULE:
            # Окно в час: если сервер был выключен ровно в 9:00, задача всё
            # равно отработает при первой же проверке после включения.
            due = now.hour > hour or (now.hour == hour and now.minute >= minute)
            if not due or _already_ran(db, name, day):
                continue
            try:
                count = _run_job(db, name)
                _mark_ran(db, name, day)
                _log.info("задача %s выполнена: %s", name, count)
                done.append((name, count))
            except Exception:  # noqa: BLE001 — одна упавшая задача не должна
                # уносить остальные и весь планировщик.
                _log.exception("задача %s упала", name)
    finally:
        db.close()
    return done


def main() -> None:  # pragma: no cover — вечный цикл
    logging.basicConfig(level=logging.INFO)
    _log.info("планировщик запущен, часовой пояс: %s", business_tz())
    while True:
        try:
            run_due()
        except Exception:  # noqa: BLE001 — планировщик не имеет права умереть
            _log.exception("сбой цикла планировщика")
        time.sleep(60)


if __name__ == "__main__":  # pragma: no cover
    main()
