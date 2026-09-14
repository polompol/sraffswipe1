"""Isolated financial tables used by the release-hardening layer.

They live outside ``models.py`` so the existing domain model stays stable while
refund state gets its own auditable records. Foreign keys use table names, so
this module does not import the domain models and can be registered early.
"""
from datetime import UTC, datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class RefundAllowance(Base):
    """Atomic per-purchase reservation counter for bank refunds."""

    __tablename__ = "refund_allowances"

    purchase_id: Mapped[str] = mapped_column(
        ForeignKey("purchases.id"), primary_key=True
    )
    reserved_amount: Mapped[int] = mapped_column(Integer, default=0)


class PaymentRefund(Base):
    """Durable, retry-safe YooKassa refund request and audit state."""

    __tablename__ = "payment_refunds"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    purchase_id: Mapped[str] = mapped_column(
        ForeignKey("purchases.id"), index=True
    )
    owner_id: Mapped[str] = mapped_column(String, index=True)
    request_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    provider_refund_id: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True
    )
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    note: Mapped[str] = mapped_column(String(200), default="")
    actor_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
