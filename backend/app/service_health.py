"""Durable liveness state for background StaffSwipe services.

Daily scheduler job completion lives in ``job_runs``.  This table answers a
different question: is the long-running process itself still alive right now?
"""
from datetime import UTC, datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow_naive() -> datetime:
    """UTC timestamp in the project's existing naive-DB representation."""
    return datetime.now(UTC).replace(tzinfo=None)


class ServiceHeartbeat(Base):
    """Latest heartbeat per long-running service process."""

    __tablename__ = "service_heartbeats"

    service: Mapped[str] = mapped_column(String, primary_key=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow_naive
    )
