"""Stage 7 scheduler process heartbeat contracts."""
from datetime import datetime, timedelta


def _heartbeat_row():
    from app.db import SessionLocal
    from app.service_health import ServiceHeartbeat

    db = SessionLocal()
    try:
        return db.get(ServiceHeartbeat, "scheduler")
    finally:
        db.close()


def test_heartbeat_has_a_dedicated_model(client):
    from app.service_health import ServiceHeartbeat

    assert ServiceHeartbeat.__tablename__ == "service_heartbeats"
    assert "service_heartbeats" in ServiceHeartbeat.metadata.tables


def test_scheduler_heartbeat_creates_one_durable_row(client):
    import app.scheduler as scheduler

    stamp = datetime(2026, 9, 16, 10, 0, 0)
    assert scheduler._write_heartbeat(stamp) is True

    row = _heartbeat_row()
    assert row is not None
    assert row.service == "scheduler"
    assert row.updated_at == stamp


def test_scheduler_heartbeat_retry_updates_instead_of_duplicating(client):
    import app.scheduler as scheduler
    from app.db import SessionLocal
    from app.service_health import ServiceHeartbeat

    first = datetime(2026, 9, 16, 10, 0, 0)
    later = first + timedelta(minutes=1)

    assert scheduler._write_heartbeat(first) is True
    assert scheduler._write_heartbeat(later) is True

    db = SessionLocal()
    try:
        rows = db.query(ServiceHeartbeat).all()
    finally:
        db.close()

    assert len(rows) == 1
    assert rows[0].service == "scheduler"
    assert rows[0].updated_at == later


def test_scheduler_heartbeat_db_failure_does_not_escape(client, monkeypatch):
    import app.scheduler as scheduler

    class BrokenSession:
        def get_bind(self):
            raise RuntimeError("database unavailable")

        def rollback(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr(scheduler, "SessionLocal", lambda: BrokenSession())

    assert scheduler._write_heartbeat() is False
