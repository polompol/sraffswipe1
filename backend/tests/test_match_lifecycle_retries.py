"""Lifecycle mutations must be safe to retry after an unknown client result.

A mobile request may reach the server and commit while Telegram loses the
response. Retrying the same user intent must return the already committed
state without duplicating system messages, reports, or changing settlement
semantics.
"""

from app.db import SessionLocal
from app.models import Match, Message, Report
from app.routers.matches import (
    AttendanceIn,
    CheckinIn,
    NotHeldIn,
    checkin,
    mark_attendance,
    mark_not_held,
)

from .test_match_lifecycle_authorization import _auth


def _confirmed(client, make_match, **fields) -> tuple[str, str, str]:
    _, employer_id = _auth(client, "employer")
    _, seeker_id = _auth(client, "seeker")
    values = {
        "status": "confirmed",
        "confirmed_by_seeker": True,
        "confirmed_by_employer": True,
        "checkin_code": "654321",
        "seeker_checked_in": False,
        "employer_checked_in": False,
        "checkin_by_code": False,
        "no_show": False,
        "disputed": False,
    }
    values.update(fields)
    match_id = make_match(employer_id, seeker_id, **values)
    return match_id, employer_id, seeker_id


def _side_effect_counts(match_id: str) -> tuple[int, int]:
    with SessionLocal() as db:
        messages = (
            db.query(Message)
            .filter(Message.match_id == match_id, Message.is_system.is_(True))
            .count()
        )
        reports = (
            db.query(Report)
            .filter(Report.target_type == "match", Report.target_id == match_id)
            .count()
        )
        return messages, reports


def test_checkin_retry_while_confirmed_does_not_duplicate_message(client, make_match):
    match_id, _, seeker_id = _confirmed(client, make_match)
    principal = {"id": seeker_id, "role": "seeker"}

    with SessionLocal() as db:
        first = checkin(match_id, CheckinIn(code="654321"), db=db, principal=principal)
    before = _side_effect_counts(match_id)
    with SessionLocal() as db:
        second = checkin(match_id, CheckinIn(code="654321"), db=db, principal=principal)

    assert first.status == "confirmed"
    assert second.status == "confirmed"
    assert before == (1, 0)
    assert _side_effect_counts(match_id) == before


def test_checkin_retry_after_completion_returns_committed_state(client, make_match):
    match_id, _, seeker_id = _confirmed(
        client, make_match, employer_checked_in=True
    )
    principal = {"id": seeker_id, "role": "seeker"}

    with SessionLocal() as db:
        first = checkin(match_id, CheckinIn(code="654321"), db=db, principal=principal)
    before = _side_effect_counts(match_id)
    with SessionLocal() as db:
        second = checkin(match_id, CheckinIn(code="654321"), db=db, principal=principal)

    assert first.status == "completed"
    assert second.status == "completed"
    assert before == (2, 0)
    assert _side_effect_counts(match_id) == before


def test_attendance_true_retry_after_completion_is_noop(client, make_match):
    match_id, employer_id, _ = _confirmed(
        client,
        make_match,
        seeker_checked_in=True,
        checkin_by_code=True,
    )
    principal = {"id": employer_id, "role": "employer"}

    with SessionLocal() as db:
        first = mark_attendance(
            match_id, AttendanceIn(attended=True), db=db, principal=principal
        )
    before = _side_effect_counts(match_id)
    with SessionLocal() as db:
        second = mark_attendance(
            match_id, AttendanceIn(attended=True), db=db, principal=principal
        )

    assert first == {"ok": True, "noShow": False, "disputed": False}
    assert second == first
    assert before == (1, 0)
    assert _side_effect_counts(match_id) == before


def test_attendance_no_show_retry_after_expired_is_noop(client, make_match):
    match_id, employer_id, _ = _confirmed(client, make_match)
    principal = {"id": employer_id, "role": "employer"}

    with SessionLocal() as db:
        first = mark_attendance(
            match_id, AttendanceIn(attended=False), db=db, principal=principal
        )
    before = _side_effect_counts(match_id)
    with SessionLocal() as db:
        second = mark_attendance(
            match_id, AttendanceIn(attended=False), db=db, principal=principal
        )

    assert first == {"ok": True, "noShow": True, "disputed": False}
    assert second == first
    assert before == (1, 0)
    assert _side_effect_counts(match_id) == before


def test_attendance_no_show_retry_during_dispute_is_noop(client, make_match):
    match_id, employer_id, _ = _confirmed(
        client,
        make_match,
        seeker_checked_in=True,
        checkin_by_code=True,
    )
    principal = {"id": employer_id, "role": "employer"}

    with SessionLocal() as db:
        first = mark_attendance(
            match_id, AttendanceIn(attended=False), db=db, principal=principal
        )
    before = _side_effect_counts(match_id)
    with SessionLocal() as db:
        second = mark_attendance(
            match_id, AttendanceIn(attended=False), db=db, principal=principal
        )

    assert first == {"ok": True, "noShow": False, "disputed": True}
    assert second == first
    assert before == (1, 1)
    assert _side_effect_counts(match_id) == before


def test_not_held_retry_after_expired_is_noop(client, make_match):
    match_id, employer_id, _ = _confirmed(client, make_match)
    principal = {"id": employer_id, "role": "employer"}
    body = NotHeldIn(reason="не вышел")

    with SessionLocal() as db:
        first = mark_not_held(match_id, body, db=db, principal=principal)
    before = _side_effect_counts(match_id)
    with SessionLocal() as db:
        second = mark_not_held(match_id, body, db=db, principal=principal)

    assert first.status == "expired"
    assert second.status == "expired"
    assert before == (1, 0)
    assert _side_effect_counts(match_id) == before


def test_not_held_retry_during_dispute_is_noop(client, make_match):
    match_id, employer_id, _ = _confirmed(
        client,
        make_match,
        seeker_checked_in=True,
        checkin_by_code=True,
    )
    principal = {"id": employer_id, "role": "employer"}
    body = NotHeldIn(reason="не вышел")

    with SessionLocal() as db:
        first = mark_not_held(match_id, body, db=db, principal=principal)
    before = _side_effect_counts(match_id)
    with SessionLocal() as db:
        second = mark_not_held(match_id, body, db=db, principal=principal)

    assert first.status == "confirmed"
    assert second.status == "confirmed"
    assert first.disputed is True
    assert second.disputed is True
    assert before == (1, 1)
    assert _side_effect_counts(match_id) == before


def test_retry_guards_do_not_change_stored_arrival_truth(client, make_match):
    match_id, employer_id, seeker_id = _confirmed(client, make_match)

    with SessionLocal() as db:
        checkin(
            match_id,
            CheckinIn(code="654321"),
            db=db,
            principal={"id": seeker_id, "role": "seeker"},
        )
    with SessionLocal() as db:
        mark_not_held(
            match_id,
            NotHeldIn(reason="не вышел"),
            db=db,
            principal={"id": employer_id, "role": "employer"},
        )

    before = _side_effect_counts(match_id)
    with SessionLocal() as db:
        mark_not_held(
            match_id,
            NotHeldIn(reason="не вышел"),
            db=db,
            principal={"id": employer_id, "role": "employer"},
        )

    with SessionLocal() as db:
        stored = db.get(Match, match_id)
        assert stored is not None
        assert stored.seeker_checked_in is True
        assert stored.checkin_by_code is True
        assert stored.no_show is False
        assert stored.disputed is True
        assert stored.status == "confirmed"
    assert _side_effect_counts(match_id) == before
