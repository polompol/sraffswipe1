"""Durable, retry-safe YooKassa refund reservations.

Revision ID: a4d9c2e1f7b6
Revises: 91c3e7a2f4b0
"""
import sqlalchemy as sa
from alembic import op

revision = "a4d9c2e1f7b6"
down_revision = "91c3e7a2f4b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refund_allowances",
        sa.Column("purchase_id", sa.String(), nullable=False),
        sa.Column("reserved_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchases.id"]),
        sa.PrimaryKeyConstraint("purchase_id"),
    )
    op.create_table(
        "payment_refunds",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("purchase_id", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("request_id", sa.String(length=36), nullable=False),
        sa.Column("provider_refund_id", sa.String(), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("note", sa.String(length=200), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchases.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_refund_id"),
        sa.UniqueConstraint("request_id"),
    )
    op.create_index(
        "ix_payment_refunds_purchase_id", "payment_refunds", ["purchase_id"]
    )
    op.create_index(
        "ix_payment_refunds_owner_id", "payment_refunds", ["owner_id"]
    )
    op.create_index(
        "ix_payment_refunds_request_id", "payment_refunds", ["request_id"], unique=True
    )
    op.create_index(
        "ix_payment_refunds_status", "payment_refunds", ["status"]
    )
    op.create_index(
        "ix_payment_refunds_actor_id", "payment_refunds", ["actor_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_payment_refunds_actor_id", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_status", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_request_id", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_owner_id", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_purchase_id", table_name="payment_refunds")
    op.drop_table("payment_refunds")
    op.drop_table("refund_allowances")
