"""Append-only журнал операторских действий.

Деньги имеют собственный WalletTxn/Purchase/Commission trail. Этот журнал —
про административную власть: блокировки, верификацию, разбор жалоб и другие
изменения чужого состояния. Запись добавляется в ту же транзакцию, что и
само действие; отдельного commit здесь намеренно нет.
"""
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base
from .models import _now, _uuid


class AdminActionLog(Base):
    """Неизменяемый след успешной операторской команды."""

    __tablename__ = "admin_action_logs"
    __table_args__ = (
        Index("ix_admin_action_created", "created_at"),
        Index("ix_admin_action_target", "target_type", "target_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    actor_id: Mapped[str] = mapped_column(String, index=True)
    action: Mapped[str] = mapped_column(String, index=True)
    target_type: Mapped[str] = mapped_column(String)
    target_id: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


def record_admin_action(
    db: Session,
    *,
    actor_id: str,
    action: str,
    target_type: str,
    target_id: str,
    reason: str = "",
) -> AdminActionLog:
    """Добавить audit row без commit — транзакцией владеет вызывающая ручка."""
    row = AdminActionLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        reason=(reason or "").strip()[:1000],
    )
    db.add(row)
    return row
