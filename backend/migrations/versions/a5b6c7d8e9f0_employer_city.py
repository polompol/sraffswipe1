"""Город заведения — своё поле, а не строчка адреса.

У заведения был только адрес одной строкой (из DaData) и город у каждой
отдельной смены. Пока город в сервисе один, этого хватало. С выходом в другие
города по городу заведения показывается лента кандидатов: без него кафе в
Казани листало бы москвичей, а заведение, которое ещё не публиковало смен,
вообще не имело города.

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
"""
import sqlalchemy as sa
from alembic import op

revision = "a5b6c7d8e9f0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employers",
        sa.Column("city", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_employers_city", "employers", ["city"])
    # Уже работающим заведениям проставляем город из их последней смены —
    # иначе после обновления их лента кандидатов окажется пустой.
    op.execute(
        """
        UPDATE employers
        SET city = COALESCE((
            SELECT v.city FROM vacancies v
            WHERE v.employer_id = employers.id AND v.city <> ''
            ORDER BY v.created_at DESC
            LIMIT 1
        ), '')
        """
    )


def downgrade() -> None:
    op.drop_index("ix_employers_city", table_name="employers")
    op.drop_column("employers", "city")
