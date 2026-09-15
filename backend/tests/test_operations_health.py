"""Stage 7 operational health contracts.

These tests deliberately keep operational health separate from API liveness:
Docker may keep serving requests while the owner still needs to know that the
scheduler or shared Redis state has stopped.
"""


def test_existing_health_contracts_stay_unchanged(client):
    live = client.get("/health")
    ready = client.get("/health/ready")

    assert live.status_code == 200
    assert live.json() == {"status": "ok"}
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok", "db": "ok"}


def test_ops_health_fails_closed_without_scheduler_heartbeat(client):
    """API+DB being alive must not hide a scheduler that never heartbeated."""
    response = client.get("/health/ops")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["components"]["db"] == "ok"
    assert body["components"]["scheduler"] == "missing"
    # Tests run without REDIS_URL by default: disabled is not an incident.
    assert body["components"]["redis"] == "disabled"


def test_redis_health_uses_a_dedicated_fresh_probe():
    """Operational probing must not rely on the cached application client."""
    from app import redisclient

    assert hasattr(redisclient, "health_probe"), (
        "Stage 7 needs a fresh Redis health probe separate from sync_client()"
    )
