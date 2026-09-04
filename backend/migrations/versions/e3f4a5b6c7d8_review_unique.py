"""Один отзыв на смену от одного человека.

Защита от дубля была только проверкой в коде, а форма оценки показывается
сразу в двух местах приложения — два быстрых нажатия проскакивали мимо неё и
дважды двигали рейтинг человека.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
"""
from alembic import op

revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Сначала убираем уже накопившиеся дубли: оставляем самый ранний отзыв.
    op.execute(
        """
        DELETE FROM reviews WHERE id NOT IN (
            SELECT MIN(id) FROM reviews GROUP BY match_id, rater_id
        )
        """
    )
    # batch_alter_table — иначе SQLite (dev и тесты) не умеет добавлять
    # ограничение к существующей таблице.
    with op.batch_alter_table("reviews") as batch:
        batch.create_unique_constraint(
            "uq_review_match_rater", ["match_id", "rater_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("reviews") as batch:
        batch.drop_constraint("uq_review_match_rater", type_="unique")
