"""Authoritative, fail-closed match action policy.

The API exposes these actions to the TMA so the client does not have to
duplicate lifecycle rules and then discover a rejection after a tap.
This helper is presentation guidance, not authorization: every endpoint
still enforces the same rule server-side.
"""
from datetime import UTC, datetime, timedelta

from .models import Match, Vacancy
from .timeutil import shift_end_utc, shift_start_utc

_HOURS_EDIT_WINDOW = timedelta(hours=24)


def allowed_match_actions(
    match: Match,
    role: str,
    vacancy: Vacancy | None,
    *,
    now: datetime | None = None,
) -> list[str]:
    """Return actions that are meaningful for this participant now.

    Time-dependent actions fail closed when the vacancy/time cannot be
    read.  That is deliberately stricter than guessing in the client.
    """
    if role not in {"seeker", "employer"}:
        return []

    status = match.status
    actions: set[str] = set()

    # Confirmation itself is status-driven and remains available on a
    # matched record even if its scheduled time has passed: this keeps
    # the existing server semantics for late/stale clients, while
    # terminal records below can never be resurrected.
    if status == "matched":
        already = (
            match.confirmed_by_seeker
            if role == "seeker"
            else match.confirmed_by_employer
        )
        if not already:
            actions.add("confirm")

    # A dispute is the recovery path for an active/closed/no-show
    # agreement.  A cancelled agreement has no forward actions.
    if status in {"matched", "confirmed", "completed", "expired"}:
        if not match.disputed:
            actions.add("dispute")

    if status == "cancelled" or match.disputed or vacancy is None:
        return sorted(actions)

    current = now or datetime.now(UTC)
    try:
        starts = shift_start_utc(
            vacancy.date, vacancy.start_time, vacancy.city
        )
        ends = shift_end_utc(
            vacancy.date,
            vacancy.start_time,
            vacancy.end_time,
            vacancy.city,
        )
    except (TypeError, ValueError):
        # Unknown time must never unlock a time-sensitive control.
        return sorted(actions)

    before_start = current < starts
    started = current >= starts
    ended = current >= ends
    untouched = not match.seeker_checked_in and not match.employer_checked_in

    if status in {"matched", "confirmed"} and before_start and untouched:
        actions.add("cancel")
        if role == "employer":
            actions.add("propose_reschedule")
        elif match.reschedule_date:
            actions.update({"accept_reschedule", "decline_reschedule"})

    if status == "confirmed" and started:
        if role == "seeker" and not match.seeker_checked_in:
            actions.add("checkin")
        if role == "employer" and not match.employer_checked_in:
            actions.add("attendance")

    if status in {"matched", "confirmed"} and ended:
        actions.add("not_held")

    if (
        role == "employer"
        and status in {"confirmed", "completed"}
        and ended
        and current - ends <= _HOURS_EDIT_WINDOW
    ):
        actions.add("set_hours")

    return sorted(actions)
