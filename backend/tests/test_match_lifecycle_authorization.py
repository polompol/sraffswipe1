"""Lifecycle authorization for matches.

These tests keep terminal shifts terminal and require the API to expose the
server's view of which actions are currently meaningful.  The TMA must not
have to re-implement status rules and then discover mismatches after a tap.
"""

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import Match
import app.routers.matches as matches_router


def _auth(client, role: str):
    response = client.post("/auth/telegram", json={"init_data": "", "role": role})
    assert response.status_code == 200, response.text
    data = response.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data["user_id"]


@pytest.mark.parametrize("terminal_status", ["cancelled", "completed", "expired"])
def test_confirm_cannot_mutate_terminal_match(client, make_match, terminal_status):
    _, employer_id = _auth(client, "employer")
    seeker_h, seeker_id = _auth(client, "seeker")
    match_id = make_match(
        employer_id,
        seeker_id,
        status=terminal_status,
        confirmed_by_seeker=False,
        confirmed_by_employer=False,
    )

    response = client.post(f"/matches/{match_id}/confirm", headers=seeker_h)

    assert response.status_code == 409, response.text
    db = SessionLocal()
    try:
        match = db.get(Match, match_id)
        assert match is not None
        assert match.status == terminal_status
        assert match.confirmed_by_seeker is False
        assert match.confirmed_by_employer is False
    finally:
        db.close()


def test_confirm_requires_matching_role_and_participant(client, make_match):
    _, employer_id = _auth(client, "employer")
    _, seeker_id = _auth(client, "seeker")
    match_id = make_match(
        employer_id,
        seeker_id,
        status="matched",
        confirmed_by_seeker=False,
        confirmed_by_employer=False,
    )

    db = SessionLocal()
    try:
        with pytest.raises(HTTPException) as exc_info:
            matches_router.confirm(
                match_id,
                force=True,
                db=db,
                # The ID belongs to the seeker side but the token claims the
                # employer role. Identity alone must never cross roles.
                principal={"id": seeker_id, "role": "employer"},
            )
        assert exc_info.value.status_code == 403
        db.rollback()

        stored = db.get(Match, match_id)
        assert stored is not None
        assert stored.confirmed_by_seeker is False
        assert stored.confirmed_by_employer is False
        assert stored.status == "matched"
    finally:
        db.close()


def test_repeat_confirm_is_idempotent_without_duplicate_notification(
    client, make_match, monkeypatch
):
    _, employer_id = _auth(client, "employer")
    _, seeker_id = _auth(client, "seeker")
    match_id = make_match(
        employer_id,
        seeker_id,
        status="matched",
        confirmed_by_seeker=False,
        confirmed_by_employer=False,
    )
    notifications: list[tuple[str, str]] = []

    def fake_notify(db, owner_id, text, **kwargs):
        notifications.append((owner_id, text))

    monkeypatch.setattr(matches_router, "notify_owner", fake_notify)

    db = SessionLocal()
    try:
        principal = {"id": seeker_id, "role": "seeker"}
        first = matches_router.confirm(
            match_id, force=True, db=db, principal=principal
        )
        second = matches_router.confirm(
            match_id, force=True, db=db, principal=principal
        )

        assert first.confirmed_by_seeker is True
        assert second.confirmed_by_seeker is True
        assert second.status == "matched"
        assert len(notifications) == 1
        assert notifications[0][0] == employer_id

        stored = db.get(Match, match_id)
        assert stored is not None
        assert stored.confirmed_by_seeker is True
        assert stored.confirmed_by_employer is False
        assert stored.status == "matched"
    finally:
        db.close()


def test_stale_reschedule_cannot_be_declined_after_match_is_terminal(
    client, make_match
):
    _, employer_id = _auth(client, "employer")
    seeker_h, seeker_id = _auth(client, "seeker")
    match_id = make_match(
        employer_id,
        seeker_id,
        status="cancelled",
        reschedule_date="2099-01-02",
        reschedule_start=600,
        reschedule_end=900,
    )

    response = client.post(f"/matches/{match_id}/reschedule/decline", headers=seeker_h)

    assert response.status_code == 409, response.text
    db = SessionLocal()
    try:
        match = db.get(Match, match_id)
        assert match is not None
        assert match.status == "cancelled"
        assert match.reschedule_date == "2099-01-02"
    finally:
        db.close()


def test_match_response_exposes_server_allowed_actions(client, make_match):
    _, employer_id = _auth(client, "employer")
    seeker_h, seeker_id = _auth(client, "seeker")
    match_id = make_match(
        employer_id,
        seeker_id,
        status="matched",
        confirmed_by_seeker=False,
        confirmed_by_employer=False,
    )

    response = client.get("/matches", headers=seeker_h)

    assert response.status_code == 200, response.text
    row = next(item for item in response.json() if item["id"] == match_id)
    assert "allowed_actions" in row
    assert "confirm" in row["allowed_actions"]


def test_terminal_match_does_not_advertise_forward_actions(client, make_match):
    _, employer_id = _auth(client, "employer")
    seeker_h, seeker_id = _auth(client, "seeker")
    match_id = make_match(
        employer_id,
        seeker_id,
        status="cancelled",
        confirmed_by_seeker=False,
        confirmed_by_employer=False,
    )

    response = client.get("/matches", headers=seeker_h)

    assert response.status_code == 200, response.text
    row = next(item for item in response.json() if item["id"] == match_id)
    assert "confirm" not in row["allowed_actions"]
    assert "cancel" not in row["allowed_actions"]
    assert "checkin" not in row["allowed_actions"]
