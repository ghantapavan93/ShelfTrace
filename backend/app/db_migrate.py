"""Lightweight additive schema migrations.

This project provisions schema via SQLAlchemy ``create_all`` (which adds any
*new* tables on boot) plus the idempotent column additions below (which upgrade
a *pre-existing* table — ``create_all`` never alters existing tables).

Running these makes an older ``price_batches`` table gain the columns introduced
by the Certification Lab phase without dropping data. No-op on a fresh database
(the columns already exist) and skipped on SQLite (tests recreate the schema).
"""
from __future__ import annotations

import logging

from sqlalchemy import text

from app.database import engine

logger = logging.getLogger("shelftrace.migrate")

# Additive, idempotent column additions (Postgres).
_PRICE_BATCH_COLUMNS = [
    ("run_mode", "VARCHAR(32) NOT NULL DEFAULT 'LIVE_ROLLOUT'"),
    ("environment", "VARCHAR(32) NOT NULL DEFAULT 'SIMULATED_PRODUCTION'"),
    ("connector_profile_id", "VARCHAR"),
    ("scenario_config_id", "VARCHAR"),
]

# Real Data Replay phase: scenarios may link to a real public-data observation.
_TEST_RUN_CONFIG_COLUMNS = [
    ("source_observation_id", "VARCHAR"),
]


def run_migrations() -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for name, ddl in _PRICE_BATCH_COLUMNS:
            conn.execute(
                text(f"ALTER TABLE price_batches ADD COLUMN IF NOT EXISTS {name} {ddl}")
            )
        # The test_run_configs table only exists after the Certification Lab phase
        # has been applied; guard the ALTER so this works on a fresh deploy too.
        exists = conn.execute(
            text("SELECT 1 FROM information_schema.tables WHERE table_name = 'test_run_configs'")
        ).scalar()
        if exists:
            for name, ddl in _TEST_RUN_CONFIG_COLUMNS:
                conn.execute(
                    text(f"ALTER TABLE test_run_configs ADD COLUMN IF NOT EXISTS {name} {ddl}")
                )
    logger.info("Additive migrations applied (price_batches + test_run_configs)")
