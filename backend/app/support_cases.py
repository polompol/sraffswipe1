"""Tracked support cases, separate from Trust & Safety reports.

Reports are moderation signals about another entity. Support cases belong to
the person who opened them and let that person see whether an operator replied.
Keeping the model separate prevents support questions from polluting the abuse
queue and its moderation semantics.
"""
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class SupportCase(Base):
    __tablename__ = "support_cases"
    __table_args__ = (
        Index(
            "ix_support_owner_role_created",
            "owner_id",
            "owner_role",
            "created_at",
        ),
        Index("ix_support_status_created", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_id)
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    owner_role: Mapped[str] = mapped_column(String, nullable=False)
    topic: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, default="open", nullable=False)
    admin_reply: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_now, nullable=False
    )


def case_number(case_id: str) -> str:
    """Human-facing stable number that does not reveal ticket volume."""
    return f"SS-{case_id[:8].upper()}"
