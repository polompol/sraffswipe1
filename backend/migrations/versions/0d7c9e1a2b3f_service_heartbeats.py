"""add service heartbeats

Revision ID: 0d7c9e1a2b3f
Revises: c6d7e8f9a0b1
Create Date: 2026-09-16
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0d7c9e1a2b3f"
down_revision: str | None = "c6d7e8f9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "service_heartbeats",
        sa.Column("service", sa.String(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("service"),
    )


def downgrade() -> None:
    op.drop_table("service_heartbeats")
