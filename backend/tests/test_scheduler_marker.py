"""Планировщик нельзя остановить снаружи.

Отметка «задача сегодня отработала» лежала в таблице событий — той самой,
куда пишет публичная ручка POST /events без авторизации. Строка получалась
побайтово такой же, как у планировщика: пять анонимных запросов объявляли
все ежедневные задачи выполненными на сутки вперёд. Сервис после этого
молча замирал: ни напоминаний о сменах, ни авто-закрытия (а значит и без
комиссии), ни сверки платежей — и в логах всё выглядело нормально.
"""
from app.db import SessionLocal
from app.models import Event, JobRun
from app.scheduler import _already_ran, _mark_ran
from app.timeutil import local_today


def test_public_events_cannot_forge_job_marker(client):
    """Публичная ручка не должна уметь писать отметку планировщика."""
    day = local_today()
    r = client.post(
        "/events",
        json={"name": "job", "props": {"job": "reminders", "day": day}},
    )
    assert r.status_code == 400, "имя «job» обязано быть зарезервированным"

    db = SessionLocal()
    try:
        assert not _already_ran(db, "reminders", day)
    finally:
        db.close()


def test_forged_event_row_does_not_stop_scheduler(client):
    """Даже если такая строка окажется в событиях — планировщик её не увидит.

    Проверяем саму развязку: отметки живут в отдельной таблице, и совпадение
    по содержимому события больше ни на что не влияет.
    """
    import json

    day = local_today()
    db = SessionLocal()
    try:
        db.add(Event(
            name="job",
            props=json.dumps({"job": "autoclose", "day": day}, ensure_ascii=False),
        ))
        db.commit()
        assert not _already_ran(db, "autoclose", day)
    finally:
        db.close()


def test_reconcile_reports_what_it_actually_restored(client, monkeypatch):
    """Ночная сверка должна писать в журнал настоящее число, а не ноль.

    Она читала из ответа ключ, которого там нет, и всегда сообщала «0» —
    даже в ту ночь, когда подобрала потерянный платёж. А «0» здесь и есть
    нормальная ночь: отличить её от найденной пропажи было невозможно.
    """
    from app import reconcile as rec
    from app import scheduler as sch
    from app.config import settings

    monkeypatch.setattr(settings, "yookassa_shop_id", "shop", False)
    monkeypatch.setattr(settings, "yookassa_secret_key", "key", False)
    monkeypatch.setattr(
        rec, "reconcile",
        lambda db, hours=48: {"checked": 5, "restored": 2,
                              "restored_rub": 6000, "skipped": 3},
    )
    db = SessionLocal()
    try:
        assert sch._run_job(db, "reconcile") == 2
    finally:
        db.close()


def test_marker_is_idempotent(client):
    """Два планировщика в одну секунду не отправят людям по два сообщения."""
    day = local_today()
    db = SessionLocal()
    try:
        _mark_ran(db, "unfilled", day)
        _mark_ran(db, "unfilled", day)  # повтор не должен падать
        assert _already_ran(db, "unfilled", day)
        assert db.query(JobRun).filter(
            JobRun.job == "unfilled", JobRun.day == day
        ).count() == 1
    finally:
        db.close()
