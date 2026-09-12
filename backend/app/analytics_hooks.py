"""Authoritative analytics from committed SQLAlchemy state changes.

UI events answer "what did someone try to do?". These hooks answer "what
actually happened?" and run after a successful database commit, so PostHog can
never become part of a shift/payment transaction.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from .models import Commission, Match, Purchase
from .posthog import capture_event

_PENDING = "staffswipe_posthog_events"
_INSTALLED = False


def _queue(
    session: Session,
    event_name: str,
    distinct_id: str,
    props: dict[str, Any],
    *,
    dedupe: str,
) -> None:
    pending: dict[str, tuple[str, str, dict[str, Any]]] = session.info.setdefault(
        _PENDING, {}
    )
    pending.setdefault(dedupe, (event_name, distinct_id, props))


def _changed_to(obj: object, attr: str, value: Any) -> bool:
    history = inspect(obj).attrs[attr].history
    return bool(history.has_changes() and history.added and history.added[-1] == value)


def _collect_match(session: Session, match: Match, is_new: bool) -> None:
    base = {
        "match_id": match.id,
        "vacancy_id": match.vacancy_id,
        "employer_id": match.employer_id,
        "source": "server",
    }
    if is_new:
        _queue(
            session,
            "match_created",
            match.user_id,
            base,
            dedupe=f"match_created:{match.id}",
        )
        return

    if _changed_to(match, "confirmed_by_seeker", True):
        _queue(
            session,
            "shift_confirmation_recorded",
            match.user_id,
            {**base, "actor_role": "seeker"},
            dedupe=f"confirm:seeker:{match.id}",
        )
    if _changed_to(match, "confirmed_by_employer", True):
        _queue(
            session,
            "shift_confirmation_recorded",
            match.employer_id,
            {**base, "actor_role": "employer"},
            dedupe=f"confirm:employer:{match.id}",
        )
    if _changed_to(match, "status", "confirmed"):
        _queue(
            session,
            "shift_confirmed",
            match.user_id,
            base,
            dedupe=f"shift_confirmed:{match.id}",
        )
    if _changed_to(match, "status", "completed"):
        _queue(
            session,
            "shift_completed",
            match.user_id,
            base,
            dedupe=f"shift_completed:{match.id}",
        )
    if _changed_to(match, "status", "cancelled"):
        _queue(
            session,
            "shift_cancelled",
            match.user_id,
            {
                **base,
                "cancelled_by": match.cancelled_by,
                "cancelled_late": bool(match.cancelled_late),
            },
            dedupe=f"shift_cancelled:{match.id}",
        )
    if _changed_to(match, "disputed", True):
        _queue(
            session,
            "shift_dispute_opened",
            match.user_id,
            base,
            dedupe=f"shift_dispute:{match.id}",
        )
    if _changed_to(match, "no_show", True):
        _queue(
            session,
            "no_show_recorded",
            match.user_id,
            base,
            dedupe=f"no_show:{match.id}",
        )

    not_held = inspect(match).attrs.not_held_by.history
    if not_held.has_changes() and not_held.added and not_held.added[-1]:
        _queue(
            session,
            "shift_not_held",
            match.user_id,
            {**base, "reported_by": str(not_held.added[-1])},
            dedupe=f"not_held:{match.id}",
        )


def _after_flush(session: Session, _flush_context: object) -> None:
    # Dirty matches go first: when normal ORM code closes a shift we know both
    # sides and attribute completion to the worker. The Commission fallback
    # below handles guarded bulk UPDATE auto-settlement where Match history is
    # intentionally not synchronized into the ORM identity map.
    for obj in session.dirty:
        if isinstance(obj, Match):
            _collect_match(session, obj, False)

    for obj in session.new:
        if isinstance(obj, Match):
            _collect_match(session, obj, True)
        elif isinstance(obj, Commission):
            props = {
                "match_id": obj.match_id,
                "employer_id": obj.employer_id,
                "shift_pay_rub": int(obj.shift_pay or 0),
                "commission_rub": int(obj.amount or 0),
                "commission_status": obj.status,
                "source": "server",
            }
            _queue(
                session,
                "commission_accrued",
                obj.employer_id,
                props,
                dedupe=f"commission:{obj.match_id}",
            )
            # Auto-settlement closes Match with a guarded Query.update(...,
            # synchronize_session=False). That intentionally has no ORM
            # attribute history. A newly flushed, idempotent Commission is the
            # durable signal that this paid/chargeable completion happened.
            # No SQL query is executed inside the flush hook.
            _queue(
                session,
                "shift_completed",
                obj.employer_id,
                {
                    "match_id": obj.match_id,
                    "employer_id": obj.employer_id,
                    "source": "server_commission_fallback",
                },
                dedupe=f"shift_completed:{obj.match_id}",
            )
        elif isinstance(obj, Purchase) and obj.status == "paid":
            _queue(
                session,
                "wallet_topup_succeeded",
                obj.owner_id,
                {
                    "amount_rub": int(obj.amount or 0),
                    "currency": obj.currency,
                    "provider": obj.provider,
                    "source": "server",
                },
                dedupe=f"purchase:{obj.id}",
            )


def _after_commit(session: Session) -> None:
    pending = session.info.pop(_PENDING, {})
    for event_name, distinct_id, props in pending.values():
        capture_event(event_name, distinct_id, props)


def _clear(session: Session) -> None:
    session.info.pop(_PENDING, None)


def _after_rollback(session: Session) -> None:
    _clear(session)


def install_analytics_hooks() -> None:
    """Install global Session listeners exactly once per process."""
    global _INSTALLED
    if _INSTALLED:
        return
    event.listen(Session, "after_flush", _after_flush)
    event.listen(Session, "after_commit", _after_commit)
    event.listen(Session, "after_rollback", _after_rollback)
    _INSTALLED = True
