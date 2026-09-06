"""tg_id: INTEGER → BIGINT (телеграм-идентификаторы давно не помещаются)

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-09-05

Telegram в документации к Bot API про User.id пишет прямо: «may have more than
32 significant bits… at most 52 significant bits, so a 64-bit integer … is
safe». В PostgreSQL INTEGER — четыре байта, потолок 2 147 483 647. Человек с
идентификатором больше этого числа не мог зарегистрироваться:

    psycopg.errors.NumericValueOutOfRange: integer out of range
    INSERT INTO users (…, tg_id, …) VALUES (…, %(tg_id)s::INTEGER, …)

Данные не меняются: BIGINT вмещает всё, что уже лежит в INTEGER.
"""
import sqlalchemy as sa
from alembic import op

revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None

_TABLES = ("users", "employers")


def upgrade() -> None:
    # SQLite объявленную ширину целого не соблюдает: там INTEGER и так хранит
    # восемь байт, и переписывать таблицу незачем. Пересборка таблицы в
    # batch-режиме ради косметики — лишний риск для схемы, на которой стоят
    # все тесты.
    if op.get_bind().dialect.name == "sqlite":
        return
    for table in _TABLES:
        op.alter_column(
            table, "tg_id",
            existing_type=sa.Integer(),
            type_=sa.BigInteger(),
            existing_nullable=True,
        )


def downgrade() -> None:
    # Обратный переход СУЖАЕТ тип: если в базе уже есть идентификатор больше
    # 2 147 483 647, PostgreSQL откажется и не даст потерять данные молча.
    if op.get_bind().dialect.name == "sqlite":
        return
    for table in _TABLES:
        op.alter_column(
            table, "tg_id",
            existing_type=sa.BigInteger(),
            type_=sa.Integer(),
            existing_nullable=True,
        )
