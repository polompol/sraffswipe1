"""Смена закрывается сама, если никто не возразил.

Раньше смена закрывалась ТОЛЬКО когда обе стороны нажимали кнопку, и комиссия
начислялась только тогда. Значит молчание заведения = бесплатная смена: чтобы
не платить 10%, достаточно было ничего не нажимать и не называть работнику код
прихода. Сторона, которая должна деньги, выигрывала от бездействия — это дыра
в самой конструкции, а не в коде.

Теперь наоборот: договорились о смене → смена считается состоявшейся, пока
кто-то не сказал обратного. Новые поля: отметка о напоминании «вчера была
смена» и заявление «смены не было».

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
"""
import sqlalchemy as sa
from alembic import op

revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "matches",
        sa.Column("settle_notified_on", sa.String(), nullable=False,
                  server_default=""),
    )
    op.add_column(
        "matches",
        sa.Column("not_held_by", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("matches", "not_held_by")
    op.drop_column("matches", "settle_notified_on")
