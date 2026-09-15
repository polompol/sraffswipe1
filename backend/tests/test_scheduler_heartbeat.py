"""Stage 7 scheduler process heartbeat contracts."""


def test_scheduler_has_durable_heartbeat_writer(client):
    import app.scheduler as scheduler

    assert hasattr(scheduler, "_write_heartbeat"), (
        "scheduler must persist process liveness independently of daily JobRun rows"
    )


def test_heartbeat_has_a_dedicated_model(client):
    import app.models as models

    assert hasattr(models, "ServiceHeartbeat"), (
        "minute-level process liveness must not overload the daily job_runs table"
    )
