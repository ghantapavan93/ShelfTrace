"""Add price_actions.promotional_price — a legitimate alternate shopper price.

A register may correctly ring a TPR / loyalty / multi-buy price instead of the
approved base. With this set, reconciliation accepts either price and won't flag
a real promo as a shopper-overcharge mismatch. Additive nullable column; NULL =
only the approved price is valid (exact-match, the original behavior).

Revision ID: 0012_action_promotional_price
Revises: 0011_action_effective_at
"""
from alembic import op
import sqlalchemy as sa


revision = "0012_action_promotional_price"
down_revision = "0011_action_effective_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("price_actions") as batch_op:
        batch_op.add_column(sa.Column("promotional_price", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("price_actions") as batch_op:
        batch_op.drop_column("promotional_price")
