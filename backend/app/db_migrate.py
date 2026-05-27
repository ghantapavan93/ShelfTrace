"""Idempotent additive migrations applied on every startup (non-Alembic path).

These are *additive only* — never drops or rewrites existing data. They exist
to bring a long-running demo database up to date without requiring operators
to run Alembic. The Alembic migrations (under ``migrations/versions/``) cover
the same ground; this module is the fallback when ``USE_ALEMBIC=false``.

If you change this file, also write a matching Alembic revision so the two
paths stay in sync.
"""
from __future__ import annotations

import logging

from sqlalchemy import text

from app.database import engine

logger = logging.getLogger("shelftrace.migrate")

# Additive, idempotent column additions for price_batches (Postgres).
_PRICE_BATCH_COLUMNS = [
    ("run_mode", "VARCHAR(32) NOT NULL DEFAULT 'LIVE_ROLLOUT'"),
    ("environment", "VARCHAR(32) NOT NULL DEFAULT 'SIMULATED_PRODUCTION'"),
    ("connector_profile_id", "VARCHAR"),
    ("scenario_config_id", "VARCHAR"),
]

# Outbox: backoff-aware reliability columns.
_OUTBOX_COLUMNS = [
    ("next_attempt_at", "TIMESTAMP WITH TIME ZONE"),
    ("last_error", "TEXT"),
]

_TEST_RUN_CONFIG_COLUMNS = [
    ("import_source_hash", "VARCHAR(64)"),
    ("import_source_name", "VARCHAR(256)"),
    ("import_summary_json", "JSONB"),
    ("created_by", "VARCHAR(128)"),
]

_SQLITE_TEST_RUN_CONFIG_COLUMNS = [
    ("import_source_hash", "VARCHAR(64)"),
    ("import_source_name", "VARCHAR(256)"),
    ("import_summary_json", "JSON"),
    ("created_by", "VARCHAR(128)"),
]

# JSONB upgrade for payload columns. Idempotent: the USING clause is a no-op
# when the column is already JSONB. Skipped silently if the table is missing.
_JSONB_TARGETS = [
    ("outbox_events", "payload_json"),
    ("execution_receipts", "raw_payload_json"),
    ("certification_checks", "evidence_json"),
]


def _upgrade_to_jsonb(conn, table: str, column: str) -> None:
    """Convert a TEXT/JSON column to JSONB if it isn't already. Idempotent."""
    row = conn.execute(
        text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).fetchone()
    if row is None:
        return  # table doesn't exist yet (fresh DB, create_all will make it JSONB)
    current_type = row[0]
    if current_type == "jsonb":
        return
    logger.info("Upgrading %s.%s from %s to JSONB", table, column, current_type)
    if current_type == "text":
        conn.execute(
            text(
                f'ALTER TABLE {table} ALTER COLUMN {column} TYPE JSONB '
                f'USING {column}::jsonb'
            )
        )
    else:  # already json / other — direct cast
        conn.execute(
            text(f'ALTER TABLE {table} ALTER COLUMN {column} TYPE JSONB')
        )


def _sqlite_table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:table"),
        {"table": table},
    ).fetchone()
    return row is not None


def _sqlite_columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {row[1] for row in rows}


def _run_sqlite_migrations() -> None:
    with engine.begin() as conn:
        if not _sqlite_table_exists(conn, "test_run_configs"):
            return
        existing = _sqlite_columns(conn, "test_run_configs")
        for name, ddl in _SQLITE_TEST_RUN_CONFIG_COLUMNS:
            if name not in existing:
                conn.execute(text(f"ALTER TABLE test_run_configs ADD COLUMN {name} {ddl}"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_test_run_configs_import_source_hash "
                "ON test_run_configs (import_source_hash)"
            )
        )
    logger.info("SQLite additive migrations applied (import provenance columns)")


def run_migrations() -> None:
    if engine.dialect.name == "sqlite":
        _run_sqlite_migrations()
        return
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for name, ddl in _PRICE_BATCH_COLUMNS:
            conn.execute(text(f"ALTER TABLE price_batches ADD COLUMN IF NOT EXISTS {name} {ddl}"))
        for name, ddl in _OUTBOX_COLUMNS:
            conn.execute(text(f"ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS {name} {ddl}"))
        for name, ddl in _TEST_RUN_CONFIG_COLUMNS:
            conn.execute(text(f"ALTER TABLE test_run_configs ADD COLUMN IF NOT EXISTS {name} {ddl}"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_test_run_configs_import_source_hash "
                "ON test_run_configs (import_source_hash)"
            )
        )
        for table, column in _JSONB_TARGETS:
            _upgrade_to_jsonb(conn, table, column)
    logger.info("Additive migrations applied (run_mode/env, outbox backoff, JSONB upgrade)")
