"""Real operator acknowledgement on incidents.

Adds acknowledged_at + acknowledged_by to the incidents table so an incident
carries a genuine ownership record (who took it, when) instead of inferring
"acknowledged" from status != open. Modeled as timestamp+actor (not a new
IncidentStatus enum value) so acknowledgement is orthogonal to the recovery
lifecycle and the change is a pure additive column add — no PG enum-type
alteration required.

Revision ID: 0009_incident_acknowledgement
Revises: 0008_kvi_perishable
"""
from alembic import op
import sqlalchemy as sa


revision = "0009_incident_acknowledgement"
down_revision = "0008_kvi_perishable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("incidents") as batch_op:
        batch_op.add_column(sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("acknowledged_by", sa.String(length=128), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("incidents") as batch_op:
        batch_op.drop_column("acknowledged_by")
        batch_op.drop_column("acknowledged_at")
