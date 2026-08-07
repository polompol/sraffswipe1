"""Поколение токенов («выйти на всех устройствах»).

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
"""
import sqlalchemy as sa
from alembic import op

revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("users", "employers"):
        op.add_column(
            table,
            sa.Column(
                "token_version", sa.Integer(), nullable=False, server_default="0"
            ),
        )


def downgrade() -> None:
    for table in ("users", "employers"):
        op.drop_column(table, "token_version")
