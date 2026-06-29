"""favorites table + worker verification fields

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-28 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'favorites',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('vacancy_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('owner_id', 'vacancy_id', name='uq_favorite'),
    )
    op.create_index('ix_favorites_owner_id', 'favorites', ['owner_id'])
    op.create_index('ix_favorites_vacancy_id', 'favorites', ['vacancy_id'])
    op.add_column(
        'users',
        sa.Column('med_book_photo', sa.String(), nullable=False, server_default=''),
    )
    op.add_column(
        'users',
        sa.Column('verify_status', sa.String(), nullable=False, server_default='none'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'verify_status')
    op.drop_column('users', 'med_book_photo')
    op.drop_index('ix_favorites_vacancy_id', table_name='favorites')
    op.drop_index('ix_favorites_owner_id', table_name='favorites')
    op.drop_table('favorites')
