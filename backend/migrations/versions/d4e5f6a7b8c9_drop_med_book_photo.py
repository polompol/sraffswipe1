"""drop user.med_book_photo and verify_status (152-ФЗ: не храним медданные)

Удаляем хранение фото медкнижки и статус верификации: медкнижка — данные о
здоровье (спец. категория ПДн), площадке-своднику хранить их не нужно и
рискованно. Проверку медкнижки делает работодатель очно.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-28 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('users', 'verify_status')
    op.drop_column('users', 'med_book_photo')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        'users',
        sa.Column('med_book_photo', sa.String(), nullable=False, server_default=''),
    )
    op.add_column(
        'users',
        sa.Column('verify_status', sa.String(), nullable=False, server_default='none'),
    )
