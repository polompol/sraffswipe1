"""Убрать подписки и премиум соискателя — их не существует.

Строка подписки не создавалась нигде: её можно было только прочитать.
Остались таблица, эндпоинт и колонка «тариф» в админке, где рядом с каждым
человеком стояло «FREE» — как будто есть и другие тарифы. Единственная модель
заработка — комиссия с закрытой смены; лимитов на число вакансий нет и не
будет, потому что сервису выгодно, чтобы смен публиковали больше.

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
"""
import sqlalchemy as sa
from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("entitlements", "seeker_premium")
    op.drop_table("subscriptions")


def downgrade() -> None:
    op.add_column(
        "entitlements",
        sa.Column("seeker_premium", sa.Boolean(), nullable=False,
                  server_default=sa.false()),
    )
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("owner_id", sa.String(), index=True),
        sa.Column("plan", sa.String(), nullable=False, server_default="free"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("renews_at", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime()),
    )
