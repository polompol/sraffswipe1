"""Private vacancy drafts with optimistic versions and publish receipts."""

import sqlalchemy as sa
from alembic import op

revision = "f5a6b7c8d9e0"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vacancy_drafts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "employer_id", sa.String(), sa.ForeignKey("employers.id"), nullable=False
        ),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("published_vacancy_id", sa.String(), sa.ForeignKey("vacancies.id")),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_vacancy_draft_owner_updated",
        "vacancy_drafts",
        ["employer_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_vacancy_draft_owner_updated", table_name="vacancy_drafts")
    op.drop_table("vacancy_drafts")
