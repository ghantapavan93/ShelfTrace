"""JSONB payloads + outbox backoff columns.

Upgrades the three text-stored JSON columns to JSONB on PostgreSQL (indexable,
validated, smaller) and adds the ``next_attempt_at`` + ``last_error`` columns
to ``outbox_events`` that drive exponential-backoff retries and dead-letter
alerting.

Idempotent. Safe to re-run on databases provisioned by the legacy
``Base.metadata.create_all`` path — the ``USING ::jsonb`` cast is a no-op when
the column is already JSONB.

Revision ID: 0002_jsonb_and_backoff
Revises: 0001_baseline
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_jsonb_and_backoff"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_JSONB_TARGETS = [
    ("outbox_events", "payload_json"),
    ("execution_receipts", "raw_payload_json"),
    ("certification_checks", "evidence_json"),
]


def _is_postgres(bind) -> bool:
    return bind.dialect.name == "postgresql"


def upgrade() -> None:
    bind = op.get_bind()

    # Outbox: backoff + diagnostics columns. Add-if-missing is idempotent.
    if _is_postgres(bind):
        op.execute("ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE")
        op.execute("ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error TEXT")
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_outbox_events_next_attempt_at "
            "ON outbox_events (next_attempt_at)"
        )
        for table, column in _JSONB_TARGETS:
            op.execute(
                f"ALTER TABLE {table} "
                f"ALTER COLUMN {column} TYPE JSONB USING {column}::jsonb"
            )
    else:
        # SQLite path: columns may already exist via create_all; tests do not
        # exercise legacy upgrades, so we just ensure the columns are present.
        with op.batch_alter_table("outbox_events") as batch:
            try:
                batch.add_column(sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
            except Exception:
                pass
            try:
                batch.add_column(sa.Column("last_error", sa.Text(), nullable=True))
            except Exception:
                pass


def downgrade() -> None:
    bind = op.get_bind()
    if not _is_postgres(bind):
        return
    op.execute("DROP INDEX IF EXISTS ix_outbox_events_next_attempt_at")
    op.execute("ALTER TABLE outbox_events DROP COLUMN IF EXISTS last_error")
    op.execute("ALTER TABLE outbox_events DROP COLUMN IF EXISTS next_attempt_at")
    for table, column in _JSONB_TARGETS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TEXT USING {column}::text")
