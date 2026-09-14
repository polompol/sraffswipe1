"""Повтор запроса чата возвращает то же сообщение."""

import sqlalchemy as sa
from alembic import op

revision = "91c3e7a2f4b0"
down_revision = "f5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages", sa.Column("client_message_id", sa.String(36), nullable=True),
    )
    op.create_index(
        "uq_message_client_request", "messages",
        ["match_id", "sender_id", "client_message_id"], unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_message_client_request", table_name="messages")
    op.drop_column("messages", "client_message_id")
