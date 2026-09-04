"""Фактические часы смены и предложение переноса.

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
"""
import sqlalchemy as sa
from alembic import op

revision = "a9b0c1d2e3f4"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("actual_minutes", sa.Integer(), nullable=True))
    op.add_column("matches", sa.Column(
        "reschedule_date", sa.String(), nullable=False, server_default=""))
    op.add_column("matches", sa.Column("reschedule_start", sa.Integer(), nullable=True))
    op.add_column("matches", sa.Column("reschedule_end", sa.Integer(), nullable=True))


def downgrade() -> None:
    for col in ("reschedule_end", "reschedule_start", "reschedule_date",
                "actual_minutes"):
        op.drop_column("matches", col)
