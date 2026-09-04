"""«Готов выйти сегодня» становится датой, а не галочкой.

Отметка хранилась как «да/нет» и жила вечно: человек нажимал её в августе,
забывал выключить — и в сентябре всё ещё стоял первым в ленте кандидатов и
получал срочные рассылки «нужен человек сегодня». Функция, которая называется
«сегодня», про сегодня ничего не знала, и заведение звало людей, которые
давно не собирались выходить.

Теперь хранится дата, на которую человек заявил готовность. Она гаснет сама
в полночь — по календарю его города, — и никакой уборки по расписанию не
нужно. Тем, у кого отметка стояла, ставим сегодняшний день: пусть их последний
день доработает честно, а завтра погаснет.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
"""
import sqlalchemy as sa
from alembic import op

revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("available_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_users_available_date", "users", ["available_date"])
    op.execute(
        "UPDATE users SET available_date = CURRENT_DATE WHERE available_today = true"
        if op.get_bind().dialect.name != "sqlite"
        else "UPDATE users SET available_date = date('now') WHERE available_today = 1"
    )
    with op.batch_alter_table("users") as batch:
        batch.drop_column("available_today")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("available_today", sa.Boolean(), nullable=False,
                  server_default=sa.false()),
    )
    op.execute("UPDATE users SET available_today = true WHERE available_date <> ''")
    op.drop_index("ix_users_available_date", table_name="users")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("available_date")
