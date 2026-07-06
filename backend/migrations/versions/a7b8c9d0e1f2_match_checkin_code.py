"""add match.checkin_code (код прихода — доказательство смены через сервис)

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-02 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'matches',
        sa.Column('checkin_code', sa.String(), nullable=False, server_default=''),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('matches', 'checkin_code')
