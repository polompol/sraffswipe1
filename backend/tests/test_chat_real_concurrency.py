"""Настоящая конкурентная гонка двух одинаковых chat receipt.

Детерминированный тест в test_chat_delivery_integrity.py уже проверяет
IntegrityError/SAVEPOINT и отсутствие повторных side effects. Здесь обе
транзакции реально стартуют по барьеру одновременно: на PostgreSQL это
проверяет уникальный индекс и recovery-путь под настоящей параллельностью.
"""
import threading
from uuid import uuid4

from app.db import SessionLocal
from app.models import Message
from app.routers.chat import _save_message
from app.schemas import MessageIn
from app.security import decode_token

from .test_chat_history import _matched


def test_two_threads_same_receipt_create_exactly_one_message(client):
    _, seeker_headers, match_id = _matched(client)
    token = seeker_headers["Authorization"].split(" ", 1)[1]
    sender_id = decode_token(token)["id"]
    receipt = uuid4()
    body = MessageIn(
        text="Одна квитанция из двух потоков",
        client_message_id=receipt,
    )
    gate = threading.Barrier(2)
    results: dict[str, object] = {}

    def write(name: str) -> None:
        db = SessionLocal()
        try:
            gate.wait(timeout=10)
            msg, created = _save_message(db, match_id, sender_id, body)
            results[name] = (msg.id, created)
        except Exception as exc:  # noqa: BLE001 — результат гонки проверяем ниже
            results[name] = exc
        finally:
            db.close()

    threads = [
        threading.Thread(target=write, args=("a",)),
        threading.Thread(target=write, args=("b",)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive(), "конкурентная отправка зависла"

    assert set(results) == {"a", "b"}
    errors = [value for value in results.values() if isinstance(value, Exception)]
    assert not errors, f"одинаковая квитанция не должна давать 500/ошибку: {errors}"

    rows = [value for value in results.values() if isinstance(value, tuple)]
    assert len(rows) == 2
    assert rows[0][0] == rows[1][0], "обе попытки обязаны вернуть один Message"
    assert sum(bool(row[1]) for row in rows) == 1, "новой должна считаться одна попытка"

    with SessionLocal() as db:
        stored = db.query(Message).filter(
            Message.match_id == match_id,
            Message.sender_id == sender_id,
            Message.client_message_id == str(receipt),
        ).all()
        assert len(stored) == 1
        assert stored[0].text == body.text
