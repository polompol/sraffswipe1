"""Arrival-code evidence must survive conflicting lifecycle mutations.

A correct venue code is evidence that the worker was physically present.  It
must never be silently discarded just because a no-show/not-held request won a
race by a few milliseconds.  Conflicting evidence goes to an operator; it does
not become a settled no-show automatically.
"""

import threading

import pytest

from app.db import SessionLocal
from app.models import Match, Report
from app.routers.matches import (
    AttendanceIn,
    CheckinIn,
    NotHeldIn,
    checkin,
    mark_attendance,
    mark_not_held,
)

from .test_match_lifecycle_authorization import _auth


class _ReadBarrierSession:
    """Force legacy db.get()-based mutations to read the same Match snapshot."""

    def __init__(self, session, match_id: str, gate: threading.Barrier):
        self._session = session
        self._match_id = match_id
        self._gate = gate

    def get(self, entity, ident, *args, **kwargs):
        value = self._session.get(entity, ident, *args, **kwargs)
        if entity is Match and ident == self._match_id:
            self._gate.wait(timeout=10)
        return value

    def __getattr__(self, name):
        return getattr(self._session, name)


def _require_postgres() -> None:
    with SessionLocal() as probe:
        if probe.get_bind().dialect.name != "postgresql":
            pytest.skip("row-lock race is a PostgreSQL production invariant")


def _confirmed_past_match(client, make_match) -> tuple[str, str, str]:
    _, employer_id = _auth(client, "employer")
    _, seeker_id = _auth(client, "seeker")
    match_id = make_match(
        employer_id,
        seeker_id,
        status="confirmed",
        confirmed_by_seeker=True,
        confirmed_by_employer=True,
        checkin_code="123456",
        seeker_checked_in=False,
        employer_checked_in=False,
        no_show=False,
    )
    return match_id, employer_id, seeker_id


def _assert_conflicting_arrival_is_disputed(match_id: str) -> None:
    with SessionLocal() as db:
        stored = db.get(Match, match_id)
        assert stored is not None
        assert stored.seeker_checked_in is True
        assert stored.checkin_by_code is True
        assert stored.no_show is False
        assert stored.disputed is True
        assert stored.status == "confirmed"
        assert (
            db.query(Report)
            .filter(Report.target_type == "match", Report.target_id == match_id)
            .count()
            == 1
        )


def test_valid_code_recovers_if_attendance_no_show_committed_first(client, make_match):
    match_id, employer_id, seeker_id = _confirmed_past_match(client, make_match)

    with SessionLocal() as db:
        result = mark_attendance(
            match_id,
            AttendanceIn(attended=False),
            db=db,
            principal={"id": employer_id, "role": "employer"},
        )
        assert result["noShow"] is True

    # The worker still has the real venue code.  A stale no-show must not erase
    # that evidence; accepting it only opens a dispute, it does not auto-pay.
    with SessionLocal() as db:
        checkin(
            match_id,
            CheckinIn(code="123456"),
            db=db,
            principal={"id": seeker_id, "role": "seeker"},
        )

    _assert_conflicting_arrival_is_disputed(match_id)


def test_valid_code_recovers_if_not_held_committed_first(client, make_match):
    match_id, employer_id, seeker_id = _confirmed_past_match(client, make_match)

    with SessionLocal() as db:
        mark_not_held(
            match_id,
            NotHeldIn(reason="не вышел"),
            db=db,
            principal={"id": employer_id, "role": "employer"},
        )

    with SessionLocal() as db:
        checkin(
            match_id,
            CheckinIn(code="123456"),
            db=db,
            principal={"id": seeker_id, "role": "seeker"},
        )

    _assert_conflicting_arrival_is_disputed(match_id)


def test_concurrent_checkin_and_attendance_no_show_never_settle_silently(
    client, make_match
):
    _require_postgres()
    match_id, employer_id, seeker_id = _confirmed_past_match(client, make_match)
    gate = threading.Barrier(2)
    results: list[object] = []

    def worker_checkin() -> None:
        session = SessionLocal()
        try:
            results.append(
                checkin(
                    match_id,
                    CheckinIn(code="123456"),
                    db=_ReadBarrierSession(session, match_id, gate),
                    principal={"id": seeker_id, "role": "seeker"},
                )
            )
        except Exception as exc:  # noqa: BLE001 — asserted below
            results.append(exc)
        finally:
            session.close()

    def employer_no_show() -> None:
        session = SessionLocal()
        try:
            results.append(
                mark_attendance(
                    match_id,
                    AttendanceIn(attended=False),
                    db=_ReadBarrierSession(session, match_id, gate),
                    principal={"id": employer_id, "role": "employer"},
                )
            )
        except Exception as exc:  # noqa: BLE001 — asserted below
            results.append(exc)
        finally:
            session.close()

    threads = [
        threading.Thread(target=worker_checkin),
        threading.Thread(target=employer_no_show),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive(), "arrival/no-show race hung"

    assert not [item for item in results if isinstance(item, Exception)]
    _assert_conflicting_arrival_is_disputed(match_id)


def test_concurrent_checkin_and_not_held_never_settle_silently(client, make_match):
    _require_postgres()
    match_id, employer_id, seeker_id = _confirmed_past_match(client, make_match)
    gate = threading.Barrier(2)
    results: list[object] = []

    def worker_checkin() -> None:
        session = SessionLocal()
        try:
            results.append(
                checkin(
                    match_id,
                    CheckinIn(code="123456"),
                    db=_ReadBarrierSession(session, match_id, gate),
                    principal={"id": seeker_id, "role": "seeker"},
                )
            )
        except Exception as exc:  # noqa: BLE001 — asserted below
            results.append(exc)
        finally:
            session.close()

    def employer_not_held() -> None:
        session = SessionLocal()
        try:
            results.append(
                mark_not_held(
                    match_id,
                    NotHeldIn(reason="не вышел"),
                    db=_ReadBarrierSession(session, match_id, gate),
                    principal={"id": employer_id, "role": "employer"},
                )
            )
        except Exception as exc:  # noqa: BLE001 — asserted below
            results.append(exc)
        finally:
            session.close()

    threads = [
        threading.Thread(target=worker_checkin),
        threading.Thread(target=employer_not_held),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive(), "arrival/not-held race hung"

    assert not [item for item in results if isinstance(item, Exception)]
    _assert_conflicting_arrival_is_disputed(match_id)
