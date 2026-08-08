"""Убрать игровые механики: буст вакансий, супер-лайки, серии заходов.

Три механики жили в базе, но не работали на задачу «найти человека на смену»:

* boosts + entitlements.boost_balance — платное поднятие вакансии в топ ленты.
  Поднимать некуда: пока заведений десятки, лента и так короткая;
* entitlements.superlike_balance — супер-лайк «Срочно». Купить его было
  негде (единственный платный рельс — пополнение баланса), выдавался один
  на аккаунт и за приглашённых друзей;
* streaks — «зашёл N дней подряд». Человек ищет подработку, а не играет.

Свайпы с направлением superlike переводим в обычный like: это тот же
положительный свайп, и мэтчи по ним должны продолжать работать.

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
"""
import sqlalchemy as sa
from alembic import op

revision = "b0c1d2e3f4a5"
down_revision = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE swipes SET direction = 'like' WHERE direction = 'superlike'")
    for col in ("boost_balance", "superlike_balance"):
        op.drop_column("entitlements", col)
    op.drop_table("boosts")
    op.drop_table("streaks")


def downgrade() -> None:
    op.add_column(
        "entitlements",
        sa.Column("superlike_balance", sa.Integer(), nullable=False,
                  server_default="1"),
    )
    op.add_column(
        "entitlements",
        sa.Column("boost_balance", sa.Integer(), nullable=False,
                  server_default="0"),
    )
    op.create_table(
        "boosts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("vacancy_id", sa.String(), index=True),
        sa.Column("expires_at", sa.String()),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "streaks",
        sa.Column("owner_id", sa.String(), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_active", sa.String(), nullable=False, server_default=""),
    )
