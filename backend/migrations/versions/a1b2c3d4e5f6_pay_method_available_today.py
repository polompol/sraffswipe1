"""add vacancy.pay_method and user.available_today

Revision ID: a1b2c3d4e5f6
Revises: 52f24481daa9
Create Date: 2026-06-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '52f24481daa9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default — чтобы существующие строки получили значение без ошибок.
    op.add_column(
        'vacancies',
        sa.Column(
            'pay_method', sa.String(), nullable=False, server_default='cash'
        ),
    )
    op.add_column(
        'users',
        sa.Column(
            'available_today',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'available_today')
    op.drop_column('vacancies', 'pay_method')
