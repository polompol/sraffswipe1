"""Real PostgreSQL race for two-sided match confirmation.

Both participants can tap confirm at almost the same time.  The final state
must be `confirmed`; it is not enough to persist both boolean flags while the
status remains stale `matched`.
"""
import threading

import pytest

from app.db import SessionLocal
from app.models import Match
from app.routers.matches import confirm

from .test_match_lifecycle_authorization import _auth


class _ReadBarrierSession:
    """Force the legacy implementation to read the same pre-confirm row.

    Once the production implementation takes a row lock before reading, this
    `get()` hook is no longer on the critical path; PostgreSQL itself then
    serializes the writers.
    """

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


def test_concurrent_two_sided_confirm_reaches_confirmed(client, make_match):
    with SessionLocal() as probe:
        if probe.get_bind().dialect.name != "postgresql":
            pytest.skip("row-lock race is a PostgreSQL production invariant")

    _, employer_id = _auth(client, "employer")
    _, seeker_id = _auth(client, "seeker")
    match_id = make_match(
        employer_id,
        seeker_id,
        status="matched",
        confirmed_by_seeker=False,
        confirmed_by_employer=False,
    )

    gate = threading.Barrier(2)
    results: dict[str, object] = {}

    def run(name: str, principal: dict[str, str]) -> None:
        session = SessionLocal()
        wrapped = _ReadBarrierSession(session, match_id, gate)
        try:
            result = confirm(
                match_id,
                force=True,
                db=wrapped,
                principal=principal,
            )
            results[name] = result.status
        except Exception as exc:  # noqa: BLE001 — race result asserted below
            results[name] = exc
        finally:
            session.close()

    threads = [
        threading.Thread(
            target=run,
            args=("seeker", {"id": seeker_id, "role": "seeker"}),
        ),
        threading.Thread(
            target=run,
            args=("employer", {"id": employer_id, "role": "employer"}),
        ),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive(), "concurrent confirm hung"

    assert set(results) == {"seeker", "employer"}
    errors = [value for value in results.values() if isinstance(value, Exception)]
    assert not errors, f"concurrent confirm must not error: {errors}"

    with SessionLocal() as db:
        stored = db.get(Match, match_id)
        assert stored is not None
        assert stored.confirmed_by_seeker is True
        assert stored.confirmed_by_employer is True
        assert stored.status == "confirmed"
        assert stored.checkin_code
