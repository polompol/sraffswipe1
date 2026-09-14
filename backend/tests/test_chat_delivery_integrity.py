"""Повторы отправки и отзыв доступа у уже открытой переписки."""
from datetime import timedelta
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from starlette.websockets import WebSocketDisconnect

from app.db import SessionLocal
from app.models import Match, Message, User
from app.routers import chat
from app.security import create_token, decode_token

from .test_chat_history import _auth, _matched


def _payload(text="Буду к началу смены"):
    return {"text": text, "client_message_id": str(uuid4())}


def _count(mid, text):
    with SessionLocal() as db:
        return db.query(Message).filter(
            Message.match_id == mid, Message.text == text,
        ).count()


def test_retry_returns_the_original_message_without_second_side_effects(
    client, monkeypatch,
):
    _, headers, mid = _matched(client)
    broadcast = AsyncMock()
    notify = Mock()
    monkeypatch.setattr(chat.manager, "broadcast", broadcast)
    monkeypatch.setattr(chat, "notify_owner", notify)
    payload = _payload()
    first = client.post(
        f"/matches/{mid}/messages", headers=headers, json=payload,
    )
    second = client.post(
        f"/matches/{mid}/messages", headers=headers, json=payload,
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert first.json().get("client_message_id") == payload["client_message_id"]
    assert first.json()["created_at"] == second.json()["created_at"]
    assert _count(mid, payload["text"]) == 1
    broadcast.assert_awaited_once()
    notify.assert_called_once()


def test_reusing_message_id_with_different_text_is_a_conflict(client):
    _, headers, mid = _matched(client)
    payload = _payload()
    assert client.post(
        f"/matches/{mid}/messages", headers=headers, json=payload,
    ).status_code == 200
    changed = {**payload, "text": "Другой текст"}

    reply = client.post(
        f"/matches/{mid}/messages", headers=headers, json=changed,
    )

    assert reply.status_code == 409
    assert _count(mid, payload["text"]) == 1
    assert _count(mid, changed["text"]) == 0


def test_retry_uses_normalized_text(client):
    _, headers, mid = _matched(client)
    payload = _payload("  До встречи  ")
    first = client.post(
        f"/matches/{mid}/messages", headers=headers, json=payload,
    )
    second = client.post(
        f"/matches/{mid}/messages", headers=headers,
        json={**payload, "text": "До встречи"},
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert _count(mid, "До встречи") == 1


@pytest.mark.parametrize("key", ["не UUID", "x" * 100, 42])
def test_invalid_message_ids_are_rejected(client, key):
    _, headers, mid = _matched(client)
    reply = client.post(
        f"/matches/{mid}/messages", headers=headers,
        json={"text": "Сообщение", "client_message_id": key},
    )
    assert reply.status_code == 422
    assert _count(mid, "Сообщение") == 0


def test_client_message_ids_are_scoped_to_the_sender(client):
    employer, seeker, mid = _matched(client)
    payload = _payload()
    first = client.post(
        f"/matches/{mid}/messages", headers=employer, json=payload,
    )
    second = client.post(
        f"/matches/{mid}/messages", headers=seeker, json=payload,
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] != second.json()["id"]
    assert _count(mid, payload["text"]) == 2


def test_replay_checks_participation_before_reading_the_receipt(client):
    _, headers, mid = _matched(client)
    payload = _payload()
    client.post(f"/matches/{mid}/messages", headers=headers, json=payload)
    with SessionLocal() as db:
        sid = db.get(Match, mid).user_id
        owner = db.get(User, sid)
        owner.tg_id = 998812
        owner.phone = "tg:998812"
        db.commit()
    stranger, _ = _auth(client, "seeker")

    reply = client.post(
        f"/matches/{mid}/messages", headers=stranger, json=payload,
    )

    assert reply.status_code == 403
    assert _count(mid, payload["text"]) == 1


def test_database_uniqueness_handles_an_insert_after_the_initial_lookup(
    client, monkeypatch,
):
    _, headers, mid = _matched(client)
    payload = _payload()
    first = client.post(
        f"/matches/{mid}/messages", headers=headers, json=payload,
    ).json()
    finder = getattr(chat, "_find_client_message", None)
    calls = 0

    def concurrent_lookup(*args):
        nonlocal calls
        calls += 1
        if calls == 1:
            return None  # Сосед успел вставить после нашего первого чтения.
        return finder(*args) if finder else None

    monkeypatch.setattr(
        chat, "_find_client_message", concurrent_lookup, raising=False,
    )
    second = client.post(
        f"/matches/{mid}/messages", headers=headers, json=payload,
    )
    assert second.status_code == 200
    assert second.json()["id"] == first["id"]
    assert _count(mid, payload["text"]) == 1


def test_rest_and_websocket_share_the_same_retry_receipt(client):
    _, headers, mid = _matched(client)
    payload = _payload()
    token = headers["Authorization"].split(" ", 1)[1]
    first = client.post(
        f"/matches/{mid}/messages", headers=headers, json=payload,
    ).json()

    with client.websocket_connect(f"/ws/chat/{mid}?token={token}") as ws:
        ws.send_json(payload)
        replay = ws.receive_json()

    assert replay["id"] == first["id"]
    assert _count(mid, payload["text"]) == 1


def test_websocket_retry_is_acknowledged_without_another_message(client):
    _, headers, mid = _matched(client)
    token = headers["Authorization"].split(" ", 1)[1]
    payload = _payload()
    with client.websocket_connect(f"/ws/chat/{mid}?token={token}") as ws:
        ws.send_json(payload)
        first = ws.receive_json()
        ws.send_json(payload)
        second = ws.receive_json()

    assert first["id"] == second["id"]
    assert _count(mid, payload["text"]) == 1


def test_websocket_cannot_reuse_message_id_for_other_text(client):
    _, headers, mid = _matched(client)
    token = headers["Authorization"].split(" ", 1)[1]
    payload = _payload()
    with client.websocket_connect(f"/ws/chat/{mid}?token={token}") as ws:
        ws.send_json(payload)
        ws.receive_json()
        ws.send_json({**payload, "text": "Подмена текста"})
        answer = ws.receive_json()

    assert "error" in answer
    assert _count(mid, "Подмена текста") == 0


@pytest.mark.parametrize(
    ("change", "close_code"),
    [("blocked", 4403), ("revoked", 4403), ("membership", 4403),
     ("expired", 4401)],
)
def test_existing_listener_is_checked_before_receiving_private_messages(
    client, monkeypatch, change, close_code,
):
    employer, seeker, mid = _matched(client)
    token = seeker["Authorization"].split(" ", 1)[1]
    eid = decode_token(employer["Authorization"].split(" ", 1)[1])["id"]
    long_lived = create_token(eid, "employer", ttl=timedelta(days=30))
    sender = {"Authorization": f"Bearer {long_lived}"}

    with client.websocket_connect(f"/ws/chat/{mid}?token={token}") as ws:
        if change == "expired":
            from datetime import datetime

            import jwt.api_jwt

            class AfterExpiry(datetime):
                @classmethod
                def now(cls, tz=None):
                    return datetime.now(tz) + timedelta(days=10)

            monkeypatch.setattr(jwt.api_jwt, "datetime", AfterExpiry)
        else:
            with SessionLocal() as db:
                match = db.get(Match, mid)
                owner = db.get(User, match.user_id)
                if change == "blocked":
                    owner.blocked = True
                elif change == "revoked":
                    owner.token_version += 1
                else:
                    other = User(phone="+79998882211", name="Другой участник")
                    db.add(other)
                    db.flush()
                    match.user_id = other.id
                db.commit()

        reply = client.post(
            f"/matches/{mid}/messages", headers=sender,
            json=_payload("Закрытая переписка"),
        )
        assert reply.status_code == 200
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == close_code
