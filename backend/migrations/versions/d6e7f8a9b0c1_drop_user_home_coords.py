"""Убрать координаты жилья соискателя (минимизация ПДн, 152-ФЗ).

Поля users.lat / users.lng существовали, но их никто не заполнял и не читал:
расстояние до смены считается от координат телефона, которые приходят в
запросе и нигде не сохраняются. Мёртвое поле с таким смыслом — ловушка: рано
или поздно в него начали бы писать настоящий адрес человека.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
"""
import sqlalchemy as sa
from alembic import op

revision = "d6e7f8a9b0c1"
down_revision = "c5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in ("lat", "lng"):
        op.drop_column("users", col)


def downgrade() -> None:
    for col in ("lat", "lng"):
        op.add_column(
            "users",
            sa.Column(col, sa.Float(), nullable=False, server_default="0"),
        )
