"""Add source_run_id to external_signals so the pricing engine can scope signals.

Revision ID: 0006_external_signal_scope
Revises: 0005_source_run_id

The 0005 migration scoped the row-data tables, but ExternalSignal was left
without a source_run_id column. The pricing engine loads ALL active signals
and applies them to every recommendation regardless of scope — so the seeded
Memorial Day demand-boost (multiplier 1.4, zone-wide) silently inflated the
expected lift on every USER-uploaded scenario's recommendations.

This adds the column + index and backfills existing rows to
'demo:memorial-day' (the only seeded signal). The engine then applies a
signal to a recommendation only when both sit on the same side of the
Live/Demo boundary (see app/scope.py::same_scope_side and
app/pricing/pipeline.py::run_pricing_engine).

Backwards-compatible: NULL means legacy/user, included by Scope.LIVE.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006_external_signal_scope"
down_revision: Union[str, None] = "0005_source_run_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "external_signals"
_INDEX = "ix_external_signals_source_run_id"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            f"ALTER TABLE {_TABLE} ADD COLUMN IF NOT EXISTS source_run_id VARCHAR(128)"
        )
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {_INDEX} ON {_TABLE} (source_run_id)"
        )
        # Best-effort backfill — the only seeded signal is the Memorial Day
        # demo boost, so any NULL row is demo data.
        try:
            op.execute(
                f"UPDATE {_TABLE} SET source_run_id = 'demo:memorial-day' "
                f"WHERE source_run_id IS NULL"
            )
        except Exception as exc:  # pragma: no cover — defensive
            import logging
            logging.getLogger("alembic.migration").warning(
                "external_signals backfill skipped: %s", exc
            )
        return

    # SQLite path — batch ALTER
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("source_run_id", sa.String(length=128), nullable=True))
        batch.create_index(_INDEX, ["source_run_id"])
    op.execute(
        f"UPDATE {_TABLE} SET source_run_id = 'demo:memorial-day' "
        f"WHERE source_run_id IS NULL"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(f"DROP INDEX IF EXISTS {_INDEX}")
        op.execute(f"ALTER TABLE {_TABLE} DROP COLUMN IF EXISTS source_run_id")
        return
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_index(_INDEX)
        batch.drop_column("source_run_id")
