"""add commissions table (учёт комиссии за закрытую смену)

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-03 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'commissions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('employer_id', sa.String(), nullable=False),
        sa.Column('match_id', sa.String(), nullable=False),
        sa.Column('shift_pay', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('match_id'),
    )
    op.create_index('ix_commissions_employer_id', 'commissions', ['employer_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_commissions_employer_id', table_name='commissions')
    op.drop_table('commissions')
