"""Рассылка не должна плодить потоки.

Раньше на КАЖДОЕ уведомление создавался отдельный поток. При обычной работе
это незаметно, но уведомления идут пачками: «срочный зов» — до двухсот
человек сразу, вечерние напоминания — по всей базе. Двести потоков в один
момент — это забитая память, и почти гарантированный отказ Telegram
«слишком часто», после которого сообщения просто пропадают.
"""
import threading

import app.notify as notify
from app.db import SessionLocal
from app.models import User


def _worker_threads() -> int:
    return sum(1 for t in threading.enumerate() if t.name.startswith("notify-"))


def test_a_burst_is_delivered_by_a_few_workers(client, monkeypatch):
    sent: list[tuple] = []
    monkeypatch.setattr(notify, "_send", lambda *a: sent.append(a))
    monkeypatch.setattr(notify.settings, "telegram_bot_token", "test-token")
    # В тесте пауз между отправками не ждём — проверяем не темп, а потоки.
    monkeypatch.setattr(notify, "_MAX_PER_SEC", 1_000_000.0)

    db = SessionLocal()
    try:
        u = User(tg_id=960001, phone="tg:960001", name="Аня")
        db.add(u)
        db.commit()
        uid = u.id
        for _ in range(200):
            notify.notify_owner(db, uid, "смена рядом")
    finally:
        db.close()

    notify._queue.join()
    assert len(sent) == 200, "ни одно уведомление не должно потеряться"
    assert _worker_threads() <= notify._WORKERS, (
        "разбирать очередь должны несколько постоянных работников, "
        "а не поток на каждое сообщение"
    )


def test_a_dead_telegram_does_not_break_the_queue(client, monkeypatch):
    """Сбой одной отправки не должен останавливать всю рассылку."""
    calls: list[int] = []

    def _boom(token, tg, text, *rest):
        calls.append(tg)
        if len(calls) == 1:
            raise RuntimeError("Telegram недоступен")

    monkeypatch.setattr(notify, "_send", _boom)
    monkeypatch.setattr(notify.settings, "telegram_bot_token", "test-token")
    monkeypatch.setattr(notify, "_MAX_PER_SEC", 1_000_000.0)

    db = SessionLocal()
    try:
        u = User(tg_id=960002, phone="tg:960002", name="Пётр")
        db.add(u)
        db.commit()
        for _ in range(5):
            notify.notify_owner(db, u.id, "смена рядом")
    finally:
        db.close()

    notify._queue.join()
    assert len(calls) == 5, "после сбоя работник обязан продолжить работу"


def test_without_a_token_nothing_is_queued(client, monkeypatch):
    """Без токена бота уведомления не копятся в памяти."""
    monkeypatch.setattr(notify.settings, "telegram_bot_token", "")
    db = SessionLocal()
    try:
        u = User(tg_id=960003, phone="tg:960003", name="Ольга")
        db.add(u)
        db.commit()
        notify.notify_owner(db, u.id, "смена рядом")
    finally:
        db.close()
    assert notify._queue.qsize() == 0
