"""add mutual check-in + dispute to matches (взаимное подтверждение выхода)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('matches', sa.Column(
        'seeker_checked_in', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('matches', sa.Column(
        'employer_checked_in', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('matches', sa.Column(
        'disputed', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('matches', 'disputed')
    op.drop_column('matches', 'employer_checked_in')
    op.drop_column('matches', 'seeker_checked_in')
