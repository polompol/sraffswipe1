"""Match.checkin_by_code — отметился ли работник кодом.

Код знает только заведение, поэтому введённый код — доказательство выхода:
по нему смена закрывается автоматически, если заведение молчит.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: str | Sequence[str] | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "matches",
        sa.Column(
            "checkin_by_code", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("matches", "checkin_by_code")
