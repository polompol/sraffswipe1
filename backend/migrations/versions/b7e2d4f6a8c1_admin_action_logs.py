"""add admin action audit log

Revision ID: b7e2d4f6a8c1
Revises: a4d9c2e1f7b6
"""
from alembic import op
import sqlalchemy as sa

revision = "b7e2d4f6a8c1"
down_revision = "a4d9c2e1f7b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_action_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=False),
        sa.Column("target_id", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_admin_action_logs_actor_id",
        "admin_action_logs",
        ["actor_id"],
        unique=False,
    )
    op.create_index(
        "ix_admin_action_logs_action",
        "admin_action_logs",
        ["action"],
        unique=False,
    )
    op.create_index(
        "ix_admin_action_created",
        "admin_action_logs",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_admin_action_target",
        "admin_action_logs",
        ["target_type", "target_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_admin_action_target", table_name="admin_action_logs")
    op.drop_index("ix_admin_action_created", table_name="admin_action_logs")
    op.drop_index("ix_admin_action_logs_action", table_name="admin_action_logs")
    op.drop_index("ix_admin_action_logs_actor_id", table_name="admin_action_logs")
    op.drop_table("admin_action_logs")
