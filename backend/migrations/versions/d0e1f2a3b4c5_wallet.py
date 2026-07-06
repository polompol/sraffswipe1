"""денежный баланс заведения + журнал движений (wallet)

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, Sequence[str], None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'entitlements',
        sa.Column('balance_rub', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_table(
        'wallet_txns',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('note', sa.String(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_wallet_txns_owner_id', 'wallet_txns', ['owner_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_wallet_txns_owner_id', table_name='wallet_txns')
    op.drop_table('wallet_txns')
    op.drop_column('entitlements', 'balance_rub')
