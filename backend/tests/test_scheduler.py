"""Ежедневные задачи выполняются сами и не дублируются.

Раньше четыре действия зависели от памяти оператора: уехал на выходные —
людям не пришли напоминания о сменах, заведения не узнали, что на завтра
никто не откликнулся.
"""
from datetime import datetime

from app.db import SessionLocal
from app.models import JobRun
from app.scheduler import SCHEDULE, run_due
from app.timeutil import business_tz, local_today


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime.now(business_tz()).replace(hour=hour, minute=minute)


def _jobs_done() -> list[str]:

    db = SessionLocal()
    try:
        return [
            r.job
            for r in db.query(JobRun).all()
        ]
    finally:
        db.close()


def test_morning_run_sends_reminders(client):
    """В девять утра напоминания уходят без участия оператора."""
    done = dict(run_due(now=_at(9, 0)))
    assert "reminders" in done
    assert "reminders" in _jobs_done()


def test_job_does_not_repeat_on_the_same_day(client):
    """Перезапуск сервера в то же время не шлёт людям второе сообщение."""
    run_due(now=_at(9, 0))
    before = len(_jobs_done())
    run_due(now=_at(9, 30))
    run_due(now=_at(10, 0))
    after = [j for j in _jobs_done() if j == "reminders"]
    assert len(after) == 1, "напоминания отправились дважды за день"
    assert len(_jobs_done()) >= before


def test_early_hours_do_not_trigger_evening_job(client):
    """В шесть утра вечерняя рассылка ещё не должна срабатывать."""
    done = dict(run_due(now=_at(6, 0)))
    assert "unfilled" not in done


def test_late_start_still_runs_missed_jobs(client):
    """Сервер включили в полдень — утренние задачи всё равно отработают.

    Иначе один перезапуск означал бы пропущенный день: люди не получили
    напоминание, и никто об этом не узнал.
    """
    done = dict(run_due(now=_at(12, 0)))
    assert "reminders" in done
    assert "abandoned" in done


def test_broken_job_does_not_stop_the_others(client, monkeypatch):
    """Упавшая задача не уносит с собой остальные и сам планировщик."""
    import app.scheduler as sched

    real = sched._run_job

    def flaky(db, name):
        if name == "abandoned":
            raise RuntimeError("база недоступна")
        return real(db, name)

    monkeypatch.setattr(sched, "_run_job", flaky)
    done = dict(run_due(now=_at(12, 0)))
    assert "reminders" in done, "остальные задачи должны были выполниться"
    assert "abandoned" not in _jobs_done(), "упавшая не помечается выполненной"


def test_schedule_is_within_a_day(client):
    """Служебная проверка расписания: часы и минуты осмысленные."""
    for hour, minute, name in SCHEDULE:
        assert 0 <= hour <= 23 and 0 <= minute <= 59, name
    assert len({name for _, _, name in SCHEDULE}) == len(SCHEDULE)
    assert local_today()
