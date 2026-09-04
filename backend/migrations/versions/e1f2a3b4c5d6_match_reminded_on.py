"""Match.reminded_on — дата последнего напоминания о смене.

Нужна, чтобы повторный запуск рассылки (оператор нажал дважды, крон)
не слал работникам дубли.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "matches",
        sa.Column("reminded_on", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("matches", "reminded_on")
