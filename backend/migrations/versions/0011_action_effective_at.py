"""Add price_actions.effective_at — scheduled go-live time for a price.

Grocery prices are time-bound (weekly ad starts Wednesday). A price whose
effective_at is in the future is "pending activation": channels still show the
old price and reconciliation must not flag that as a mismatch. Additive nullable
column; NULL = effective immediately (existing behavior unchanged).

Revision ID: 0011_action_effective_at
Revises: 0010_implausible_price_incident
"""
from alembic import op
import sqlalchemy as sa


revision = "0011_action_effective_at"
down_revision = "0010_implausible_price_incident"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("price_actions") as batch_op:
        batch_op.add_column(sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("price_actions") as batch_op:
        batch_op.drop_column("effective_at")
