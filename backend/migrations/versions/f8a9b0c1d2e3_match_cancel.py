"""Отмена смены: кто, почему и насколько поздно.

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
"""
import sqlalchemy as sa
from alembic import op

revision = "f8a9b0c1d2e3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matches", sa.Column(
        "cancelled_by", sa.String(), nullable=False, server_default=""))
    op.add_column("matches", sa.Column(
        "cancel_reason", sa.String(), nullable=False, server_default=""))
    op.add_column("matches", sa.Column(
        "cancelled_late", sa.Boolean(), nullable=False, server_default="0"))


def downgrade() -> None:
    for col in ("cancelled_late", "cancel_reason", "cancelled_by"):
        op.drop_column("matches", col)
