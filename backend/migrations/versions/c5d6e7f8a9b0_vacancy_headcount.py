"""Сколько человек нужно на смену.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
"""
import sqlalchemy as sa
from alembic import op

revision = "c5d6e7f8a9b0"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vacancies",
        sa.Column("headcount", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("vacancies", "headcount")
