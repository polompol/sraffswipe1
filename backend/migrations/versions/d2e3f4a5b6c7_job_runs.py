"""Отметки ежедневных задач — в своей таблице, а не в аналитике.

Отметка «задача сегодня отработала» лежала в таблице событий, куда пишет
публичная ручка POST /events (она без авторизации — воронку считаем ещё до
входа). Строка получалась побайтово такой же, как у планировщика, поэтому
кто угодно пятью запросами объявлял все задачи выполненными на сутки вперёд:
сервис замирал без напоминаний, авто-закрытия смен (а значит и комиссии) и
сверки платежей.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
"""
import sqlalchemy as sa
from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job", sa.String(), nullable=False),
        sa.Column("day", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("job", "day", name="uq_job_run_day"),
    )
    op.create_index("ix_job_runs_job", "job_runs", ["job"])
    op.create_index("ix_job_runs_day", "job_runs", ["day"])
    # Старые отметки не переносим: они не отличимы от подделанных, а пропуск
    # одного дня безобиден — задачи идемпотентны сами по себе.
    op.execute("DELETE FROM events WHERE name = 'job'")


def downgrade() -> None:
    op.drop_index("ix_job_runs_day", table_name="job_runs")
    op.drop_index("ix_job_runs_job", table_name="job_runs")
    op.drop_table("job_runs")
