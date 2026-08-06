"""Индексы под главный запрос ленты.

Лента — самый частый запрос сервиса и всегда фильтрует активные смены с
датой не в прошлом. Плюс отдельный индекс на employer_id: внешний ключ
в PostgreSQL индекс не создаёт, а по нему идут «мои смены» и поиск
встречного лайка.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
"""
from collections.abc import Sequence

from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_vacancy_status_date", "vacancies", ["status", "date"]
    )
    op.create_index(
        "ix_vacancies_employer_id", "vacancies", ["employer_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_vacancies_employer_id", table_name="vacancies")
    op.drop_index("ix_vacancy_status_date", table_name="vacancies")
