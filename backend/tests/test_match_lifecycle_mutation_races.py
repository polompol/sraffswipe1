"""PostgreSQL races and role binding for lifecycle mutations.

Client-side double-tap guards improve UX, but correctness must survive two
requests from separate tabs/workers.  These tests force the legacy `db.get()`
implementations to read the same pre-mutation Match row.
"""

import threading

import pytest
from fastapi import HTTPException

from app.db import SessionLocal
from app.models import Match, Message, Report
from app.routers.matches import CancelIn, DisputeIn, cancel_shift, dispute

from .test_cancel_shift import _matched


class _ReadBarrierSession:
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


def _participant_ids(match_id: str) -> tuple[str, str]:
    with SessionLocal() as db:
        match = db.get(Match, match_id)
        assert match is not None
        return match.user_id, match.employer_id


def test_concurrent_duplicate_dispute_creates_one_case(client):
    _require_postgres()
    _, _, seeker_id, _, match_id = _matched(client, 871001, 871002)
    gate = threading.Barrier(2)
    results: list[object] = []

    def run() -> None:
        session = SessionLocal()
        wrapped = _ReadBarrierSession(session, match_id, gate)
        try:
            results.append(
                dispute(
                    match_id,
                    DisputeIn(note="двойной тап"),
                    db=wrapped,
                    principal={"id": seeker_id, "role": "seeker"},
                )
            )
        except Exception as exc:  # noqa: BLE001 — asserted below
            results.append(exc)
        finally:
            session.close()

    threads = [threading.Thread(target=run), threading.Thread(target=run)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive(), "concurrent dispute hung"

    errors = [item for item in results if isinstance(item, Exception)]
    assert not errors, f"duplicate dispute should be an idempotent no-op: {errors}"

    with SessionLocal() as db:
        reports = db.query(Report).filter(Report.target_id == match_id).count()
        messages = (
            db.query(Message)
            .filter(
                Message.match_id == match_id,
                Message.is_system.is_(True),
                Message.text == "Открыт спор по смене — разбирает оператор StaffSwipe.",
            )
            .count()
        )
        assert reports == 1
        assert messages == 1


def test_concurrent_duplicate_cancel_has_one_winner(client):
    _require_postgres()
    _, _, seeker_id, _, match_id = _matched(client, 871011, 871012)
    gate = threading.Barrier(2)
    results: list[object] = []

    def run() -> None:
        session = SessionLocal()
        wrapped = _ReadBarrierSession(session, match_id, gate)
        try:
            results.append(
                cancel_shift(
                    match_id,
                    CancelIn(reason="двойной тап"),
                    db=wrapped,
                    principal={"id": seeker_id, "role": "seeker"},
                )
            )
        except Exception as exc:  # noqa: BLE001 — asserted below
            results.append(exc)
        finally:
            session.close()

    threads = [threading.Thread(target=run), threading.Thread(target=run)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive(), "concurrent cancel hung"

    successes = [item for item in results if not isinstance(item, Exception)]
    conflicts = [
        item
        for item in results
        if isinstance(item, HTTPException) and item.status_code == 409
    ]
    assert len(successes) == 1
    assert len(conflicts) == 1

    with SessionLocal() as db:
        messages = (
            db.query(Message)
            .filter(
                Message.match_id == match_id,
                Message.is_system.is_(True),
                Message.text.contains("Смена отменена"),
            )
            .count()
        )
        assert messages == 1


def test_dispute_rejects_participant_id_with_wrong_role(client):
    _, _, _, _, match_id = _matched(client, 871021, 871022)
    seeker_id, _ = _participant_ids(match_id)

    with SessionLocal() as db:
        with pytest.raises(HTTPException) as raised:
            dispute(
                match_id,
                DisputeIn(note="wrong role"),
                db=db,
                principal={"id": seeker_id, "role": "employer"},
            )
    assert raised.value.status_code == 403


def test_cancel_rejects_participant_id_with_wrong_role(client):
    _, _, _, _, match_id = _matched(client, 871031, 871032)
    seeker_id, _ = _participant_ids(match_id)

    with SessionLocal() as db:
        with pytest.raises(HTTPException) as raised:
            cancel_shift(
                match_id,
                CancelIn(reason="wrong role"),
                db=db,
                principal={"id": seeker_id, "role": "employer"},
            )
    assert raised.value.status_code == 403
