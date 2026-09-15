"""Stage 7 operational health contracts.

These tests deliberately keep operational health separate from API liveness:
Docker may keep serving requests while the owner still needs to know that the
scheduler or shared Redis state has stopped.
"""
from datetime import UTC, datetime, timedelta


def _clear_heartbeat() -> None:
    from app.db import SessionLocal
    from app.service_health import ServiceHeartbeat

    db = SessionLocal()
    try:
        db.query(ServiceHeartbeat).delete()
        db.commit()
    finally:
        db.close()


def _set_heartbeat(updated_at: datetime) -> None:
    from app.db import SessionLocal
    from app.service_health import ServiceHeartbeat

    if updated_at.tzinfo is not None:
        updated_at = updated_at.astimezone(UTC).replace(tzinfo=None)
    db = SessionLocal()
    try:
        db.query(ServiceHeartbeat).delete()
        db.add(ServiceHeartbeat(service="scheduler", updated_at=updated_at))
        db.commit()
    finally:
        db.close()


def test_existing_health_contracts_stay_unchanged(client):
    live = client.get("/health")
    ready = client.get("/health/ready")

    assert live.status_code == 200
    assert live.json() == {"status": "ok"}
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok", "db": "ok"}


def test_ops_health_fails_closed_without_scheduler_heartbeat(client):
    """API+DB being alive must not hide a scheduler that never heartbeated."""
    _clear_heartbeat()
    response = client.get("/health/ops")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["components"]["db"] == "ok"
    assert body["components"]["scheduler"] == "missing"
    # Tests run without REDIS_URL by default: disabled is not an incident.
    assert body["components"]["redis"] == "disabled"
    assert body["schedulerAgeSeconds"] is None


def test_ops_health_is_green_with_fresh_scheduler_heartbeat(client):
    _set_heartbeat(datetime.now(UTC) - timedelta(seconds=10))

    response = client.get("/health/ops")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["components"] == {
        "db": "ok",
        "redis": "disabled",
        "scheduler": "ok",
    }
    assert 0 <= body["schedulerAgeSeconds"] < 180


def test_ops_health_detects_stale_scheduler_heartbeat(client):
    _set_heartbeat(datetime.now(UTC) - timedelta(minutes=5))

    response = client.get("/health/ops")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["components"]["scheduler"] == "stale"
    assert body["schedulerAgeSeconds"] >= 180


def test_ops_health_detects_configured_redis_failure(client, monkeypatch):
    from app import redisclient

    _set_heartbeat(datetime.now(UTC))
    monkeypatch.setattr(redisclient, "health_probe", lambda: "unavailable")

    response = client.get("/health/ops")

    assert response.status_code == 503
    body = response.json()
    assert body["components"]["db"] == "ok"
    assert body["components"]["scheduler"] == "ok"
    assert body["components"]["redis"] == "unavailable"


def test_redis_health_probe_is_fresh_and_does_not_mutate_runtime_cache(monkeypatch):
    import redis

    from app import redisclient
    from app.config import settings

    class FakeRedis:
        def __init__(self):
            self.pings = 0
            self.closed = False

        def ping(self):
            self.pings += 1
            return True

        def close(self):
            self.closed = True

    probe = FakeRedis()
    before = (
        redisclient._sync_client,
        redisclient._async_client,
        redisclient._sync_ready,
        redisclient._async_ready,
    )
    monkeypatch.setattr(settings, "redis_url", "redis://ops-probe.invalid/0")
    monkeypatch.setattr(redis.Redis, "from_url", lambda *args, **kwargs: probe)

    assert redisclient.health_probe() == "ok"
    assert probe.pings == 1
    assert probe.closed is True
    assert (
        redisclient._sync_client,
        redisclient._async_client,
        redisclient._sync_ready,
        redisclient._async_ready,
    ) == before


def test_ops_health_response_is_bounded_and_sanitized(client):
    _clear_heartbeat()

    response = client.get("/health/ops")
    body = response.json()
    rendered = str(body).lower()

    assert set(body) == {"status", "components", "schedulerAgeSeconds"}
    assert set(body["components"]) == {"db", "redis", "scheduler"}
    for forbidden in ("postgresql://", "redis://", "password", "traceback", "secret"):
        assert forbidden not in rendered
