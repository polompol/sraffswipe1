"""Причина списания комиссии (прощено по спору / безнадёжный долг).

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
"""
import sqlalchemy as sa
from alembic import op

revision = "e7f8a9b0c1d2"
down_revision = "d6e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "commissions",
        sa.Column("note", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("commissions", "note")
