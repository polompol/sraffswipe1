"""Дата создания обязательна — как и записано в моделях.

Три таблицы создавались, когда поле «когда запись появилась» объявили
необязательным: комиссии, избранное и отметки о запусках задач. В моделях оно
обязательное, и приложение всегда его заполняет, — но база разрешала строку
без даты. Расхождение молчаливое и опасное ровно в одном месте: запись,
вставленная мимо приложения (перенос данных, правка руками у оператора),
пройдёт в базу, а на чтении упадёт уже у живого человека.

Сначала проставляем дату там, где её нет, — иначе перевод колонки в
обязательную не пройдёт на непустой базе.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
"""
import sqlalchemy as sa
from alembic import op

revision = "d3e4f5a6b7c8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None

_TABLES = ("commissions", "favorites", "job_runs")


def upgrade() -> None:
    for table in _TABLES:
        # Строки без даты: ставим текущее время. Другого разумного значения
        # нет — точный момент создания для них уже потерян.
        op.execute(
            f"UPDATE {table} SET created_at = CURRENT_TIMESTAMP "
            "WHERE created_at IS NULL"
        )
        # batch_alter_table обязателен: SQLite не умеет менять колонку на
        # месте и таблицу приходится пересобирать.
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                "created_at", existing_type=sa.DateTime(), nullable=False
            )


def downgrade() -> None:
    for table in _TABLES:
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                "created_at", existing_type=sa.DateTime(), nullable=True
            )
