"""Add test_run_actions.effective_at + promotional_price.

So the Scenario Builder can set a scheduled go-live time and a legitimate promo
price per action, which carry into the executed PriceAction. Additive nullable
columns; NULL preserves existing behavior.

Revision ID: 0013_scenario_action_grocery_fields
Revises: 0012_action_promotional_price
"""
from alembic import op
import sqlalchemy as sa


revision = "0013_scenario_action_grocery_fields"
down_revision = "0012_action_promotional_price"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("test_run_actions") as batch_op:
        batch_op.add_column(sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("promotional_price", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("test_run_actions") as batch_op:
        batch_op.drop_column("promotional_price")
        batch_op.drop_column("effective_at")
