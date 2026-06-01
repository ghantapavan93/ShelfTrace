"""Widen incidents.type to VARCHAR so the new IMPLAUSIBLE_PRICE value fits.

The plausibility gate opens IncidentType.IMPLAUSIBLE_PRICE incidents when an
approved price looks like a data error (below cost / decimal slip / cross-store
outlier). The Incident.type column is switched to native_enum=False (VARCHAR),
so adding enum values is additive and needs no PG enum ALTER. This migration
makes the column VARCHAR(32) if it isn't already; existing rows keep their
string values unchanged.

Revision ID: 0010_implausible_price_incident
Revises: 0009_incident_acknowledgement
"""
from alembic import op
import sqlalchemy as sa


revision = "0010_implausible_price_incident"
down_revision = "0009_incident_acknowledgement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Convert incidents.type to a plain VARCHAR(32). USING is a no-op when it's
    # already textual. Wrapped defensively so a fresh create_all DB (already the
    # right shape) is unaffected.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "ALTER TABLE incidents ALTER COLUMN type TYPE VARCHAR(32) "
            "USING type::text"
        )


def downgrade() -> None:
    # No-op: VARCHAR is a strict superset of the prior enum domain; narrowing
    # back could orphan IMPLAUSIBLE_PRICE rows, so we intentionally do not.
    pass
