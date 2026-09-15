"""add tracked support cases

Revision ID: c6d7e8f9a0b1
Revises: b7e2d4f6a8c1
Create Date: 2026-09-15
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c6d7e8f9a0b1"
down_revision: str | None = "b7e2d4f6a8c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "support_cases",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("owner_role", sa.String(), nullable=False),
        sa.Column("topic", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("admin_reply", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_support_owner_role_created",
        "support_cases",
        ["owner_id", "owner_role", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_support_status_created",
        "support_cases",
        ["status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_support_status_created", table_name="support_cases")
    op.drop_index("ix_support_owner_role_created", table_name="support_cases")
    op.drop_table("support_cases")
