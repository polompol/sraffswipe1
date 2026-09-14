"""Секрет webhook не должен попадать в журнал рядом с токеном чата."""

import logging

import pytest

from app.main import _RedactTokensInLogs


@pytest.mark.parametrize("logger_name", ["uvicorn.access", "uvicorn.error"])
@pytest.mark.parametrize("style", ["message", "tuple", "mapping"])
def test_query_credentials_are_redacted_for_all_log_styles(logger_name, style):
    request = (
        "POST /billing/webhook?secret=webhook-secret-fixture"
        "&token=chat-token-fixture&secret=second-webhook-fixture&source=provider"
    )
    expected = (
        "POST /billing/webhook?secret=REDACTED"
        "&token=REDACTED&secret=REDACTED&source=provider -> 200"
    )
    if style == "message":
        message, args = request + " -> 200", None
    elif style == "tuple":
        message, args = "%s -> %s", (request, 200)
    else:
        message = "%(request)s -> %(status)s"
        args = ({"request": request, "status": 200},)

    record = logging.LogRecord(
        logger_name, logging.INFO, __file__, 1, message, args, None,
    )
    log_filter = _RedactTokensInLogs()
    assert log_filter.filter(record) is True
    assert record.getMessage() == expected

    # Несколько установленных фильтров не должны портить запись.
    assert log_filter.filter(record) is True
    assert record.getMessage() == expected
