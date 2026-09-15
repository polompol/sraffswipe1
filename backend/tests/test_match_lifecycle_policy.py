"""Contract tests for the server-owned match action matrix."""

from datetime import UTC, datetime
from types import SimpleNamespace

from app.match_lifecycle import allowed_match_actions


def _match(**overrides):
    data = {
        "status": "matched",
        "confirmed_by_seeker": False,
        "confirmed_by_employer": False,
        "disputed": False,
        "seeker_checked_in": False,
        "employer_checked_in": False,
        "reschedule_date": "",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _vacancy(**overrides):
    # BUSINESS_TZ defaults to Moscow (+03): 10:00 local = 07:00 UTC,
    # 12:00 local = 09:00 UTC for this fixed winter date.
    data = {
        "date": "2026-01-01",
        "start_time": 600,
        "end_time": 720,
        "city": "Москва",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def test_before_start_actions_are_role_specific():
    now = datetime(2026, 1, 1, 6, 0, tzinfo=UTC)

    seeker = set(allowed_match_actions(_match(), "seeker", _vacancy(), now=now))
    employer = set(allowed_match_actions(_match(), "employer", _vacancy(), now=now))

    assert {"confirm", "cancel"} <= seeker
    assert "propose_reschedule" not in seeker
    assert {"confirm", "cancel", "propose_reschedule"} <= employer
    assert "checkin" not in seeker
    assert "attendance" not in employer


def test_pending_reschedule_is_only_actionable_by_seeker_before_start():
    now = datetime(2026, 1, 1, 6, 0, tzinfo=UTC)
    match = _match(status="confirmed", reschedule_date="2026-01-02")

    seeker = set(allowed_match_actions(match, "seeker", _vacancy(), now=now))
    employer = set(allowed_match_actions(match, "employer", _vacancy(), now=now))

    assert {"accept_reschedule", "decline_reschedule"} <= seeker
    assert "accept_reschedule" not in employer
    assert "decline_reschedule" not in employer
    assert "propose_reschedule" in employer


def test_started_confirmed_shift_exposes_only_role_checkin_control():
    now = datetime(2026, 1, 1, 8, 0, tzinfo=UTC)
    match = _match(status="confirmed")

    seeker = set(allowed_match_actions(match, "seeker", _vacancy(), now=now))
    employer = set(allowed_match_actions(match, "employer", _vacancy(), now=now))

    assert "checkin" in seeker
    assert "attendance" not in seeker
    assert "attendance" in employer
    assert "checkin" not in employer
    assert "cancel" not in seeker | employer


def test_after_end_actions_do_not_reopen_normal_forward_flow():
    now = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)
    match = _match(status="confirmed")

    seeker = set(allowed_match_actions(match, "seeker", _vacancy(), now=now))
    employer = set(allowed_match_actions(match, "employer", _vacancy(), now=now))

    assert "not_held" in seeker
    assert "not_held" in employer
    assert "set_hours" not in seeker
    assert "set_hours" in employer
    assert "cancel" not in seeker | employer
    assert "propose_reschedule" not in seeker | employer


def test_disputed_and_cancelled_matches_fail_closed():
    now = datetime(2026, 1, 1, 6, 0, tzinfo=UTC)

    assert allowed_match_actions(
        _match(status="confirmed", disputed=True), "seeker", _vacancy(), now=now
    ) == []
    assert allowed_match_actions(
        _match(status="cancelled"), "employer", _vacancy(), now=now
    ) == []


def test_terminal_matches_never_reopen_confirmation():
    now = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)

    for status in ("completed", "expired", "cancelled"):
        seeker = set(
            allowed_match_actions(_match(status=status), "seeker", _vacancy(), now=now)
        )
        employer = set(
            allowed_match_actions(
                _match(status=status), "employer", _vacancy(), now=now
            )
        )
        assert "confirm" not in seeker | employer


def test_bad_shift_time_never_unlocks_time_sensitive_actions():
    now = datetime(2026, 1, 1, 6, 0, tzinfo=UTC)
    actions = set(
        allowed_match_actions(
            _match(), "employer", _vacancy(date="not-a-date"), now=now
        )
    )

    # Status-driven recovery/confirmation may remain available, but bad time
    # must not invent a cancellation, reschedule, attendance or hours window.
    assert "confirm" in actions
    assert not actions.intersection(
        {"cancel", "propose_reschedule", "attendance", "not_held", "set_hours"}
    )
