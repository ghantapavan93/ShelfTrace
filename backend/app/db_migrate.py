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
    # Real Data Replay: scenarios may link to a real public-data observation.
    ("source_observation_id", "VARCHAR"),
]

_SQLITE_TEST_RUN_CONFIG_COLUMNS = [
    ("import_source_hash", "VARCHAR(64)"),
    ("import_source_name", "VARCHAR(256)"),
    ("import_summary_json", "JSON"),
    ("created_by", "VARCHAR(128)"),
    ("source_observation_id", "VARCHAR"),
]

# JSONB upgrade for payload columns. Idempotent: the USING clause is a no-op
# when the column is already JSONB. Skipped silently if the table is missing.
_JSONB_TARGETS = [
    ("outbox_events", "payload_json"),
    ("execution_receipts", "raw_payload_json"),
    ("certification_checks", "evidence_json"),
]

# source_run_id data-scope column applied across the core tables.
# Mirrors Alembic 0005_source_run_id one-to-one so the non-Alembic fallback
# path leaves the DB in the same shape. Index name parallels the migration.
_SOURCE_RUN_ID_TABLES = [
    ("price_batches", "ix_price_batches_source_run_id"),
    ("product_entities", "ix_product_entities_source_run_id"),
    ("product_costs", "ix_product_costs_source_run_id"),
    ("historical_sales", "ix_historical_sales_source_run_id"),
    ("pricing_recommendations", "ix_pricing_recommendations_source_run_id"),
    ("competitor_price_observations", "ix_competitor_price_observations_source_run_id"),
    ("sku_product_links", "ix_sku_product_links_source_run_id"),
    # Added in the round-3 engine fix: signals carry scope so the pricing
    # engine only applies them to recs on the same Live/Demo side.
    ("external_signals", "ix_external_signals_source_run_id"),
]


def _apply_source_run_id_backfill(conn) -> None:
    """Stamp known demo / catch-all values on rows that pre-date the column.
    Same logic as the Alembic migration, dialect-agnostic SQL."""
    conn.execute(
        text(
            "UPDATE price_batches SET source_run_id = 'demo:memorial-day' "
            "WHERE source_run_id IS NULL AND external_id = 'memorial-day-dallas-02'"
        )
    )
    conn.execute(
        text(
            "UPDATE price_batches SET source_run_id = 'demo:realistic-scale' "
            "WHERE source_run_id IS NULL AND external_id = 'realistic-scale-catalog'"
        )
    )
    conn.execute(
        text(
            "UPDATE price_batches SET source_run_id = 'demo:certification' "
            "WHERE source_run_id IS NULL AND external_id LIKE 'certification-%'"
        )
    )
    conn.execute(
        text(
            "UPDATE price_batches SET source_run_id = 'user:legacy' "
            "WHERE source_run_id IS NULL"
        )
    )
    # Entities flagged is_manual=TRUE are the Memorial Day seed.
    # SQLite stores booleans as 0/1; Postgres as true/false. Use a value
    # that works for both via cross-dialect comparison.
    if conn.dialect.name == "postgresql":
        conn.execute(
            text(
                "UPDATE product_entities SET source_run_id = 'demo:memorial-day' "
                "WHERE source_run_id IS NULL AND is_manual = TRUE"
            )
        )
    else:
        conn.execute(
            text(
                "UPDATE product_entities SET source_run_id = 'demo:memorial-day' "
                "WHERE source_run_id IS NULL AND is_manual = 1"
            )
        )
    conn.execute(
        text(
            "UPDATE product_entities SET source_run_id = 'user:legacy' "
            "WHERE source_run_id IS NULL"
        )
    )
    for table in (
        "product_costs",
        "historical_sales",
        "pricing_recommendations",
        "competitor_price_observations",
        "sku_product_links",
    ):
        conn.execute(
            text(
                f"UPDATE {table} SET source_run_id = 'user:legacy' "
                f"WHERE source_run_id IS NULL"
            )
        )
    # External signals: the only seeded signal is the Memorial Day demand
    # boost, so any pre-column NULL row is demo data. Stamping it demo keeps
    # the engine from applying it to user recs.
    conn.execute(
        text(
            "UPDATE external_signals SET source_run_id = 'demo:memorial-day' "
            "WHERE source_run_id IS NULL"
        )
    )
    # Correct seed rows the blanket 'user:legacy' fallback mislabeled.
    _reclassify_demo_rows(conn)


# Memorial Day demo SKUs — the seed_history catalog (seed.py PROFILES) and the
# create_memorial_day scenario actions. Stable + small, so safe to hardcode as
# a fallback if the import below fails (e.g. during a partial deploy).
_MEMORIAL_DAY_SKUS_FALLBACK = [
    "milk-organic-1gal",
    "egg-cage-free-brown-12",
    "strawberry-1lb",
    "oj-nfc-premium-52oz",
]


def _reclassify_demo_rows(conn) -> None:
    """Re-tag demo seed rows that the blanket NULL→'user:legacy' backfill
    mislabeled, so Live mode (which includes user:legacy) stays free of seeded
    data.

    The seed_history / realistic_scale loaders now stamp source_run_id at
    creation, but rows written BEFORE that shipped were left NULL and then
    blanket-mapped to 'user:legacy'. Those rows are demo data — this corrects
    their scope to 'demo:*'.

    Safety: only touches rows whose scope is NULL or exactly 'user:legacy'.
    Genuine user uploads always carry a 'user:<hash>' / 'user:scenario-*' tag,
    so they are never reclassified. Keyed by the known demo SKU sets (costs /
    history / recs) and by demo-entity lineage (competitor observations / SKU
    links). Idempotent — re-running is a no-op once rows are already demo:*.
    """
    # Memorial Day SKUs — prefer the live PROFILES list, fall back to the
    # hardcoded set if the import isn't available.
    try:
        from app.pricing.seed import PROFILES as _MD_PROFILES

        md_skus = sorted({p["sku"] for p in _MD_PROFILES})
    except Exception:  # pragma: no cover - defensive
        md_skus = list(_MEMORIAL_DAY_SKUS_FALLBACK)

    # Realistic Scale SKUs — best-effort; these are already demo-stamped at
    # load time, so this is just belt-and-suspenders for any legacy rows.
    try:
        from app.scenarios.realistic_scale import CATALOG as _RS_CATALOG

        rs_skus = sorted({item.sku for item in _RS_CATALOG})
    except Exception:  # pragma: no cover - defensive
        rs_skus = []

    from sqlalchemy import bindparam

    sku_tables = ("product_costs", "historical_sales", "pricing_recommendations")
    for table, skus, scope_id in (
        *[(t, md_skus, "demo:memorial-day") for t in sku_tables],
        *[(t, rs_skus, "demo:realistic-scale") for t in sku_tables],
    ):
        if not skus:
            continue
        conn.execute(
            text(
                f"UPDATE {table} SET source_run_id = :scope "
                f"WHERE (source_run_id IS NULL OR source_run_id = 'user:legacy') "
                f"AND sku IN :skus"
            ).bindparams(bindparam("skus", expanding=True)),
            {"scope": scope_id, "skus": skus},
        )

    # Graph rows carry no SKU on the row itself — inherit the linked entity's
    # demo scope. Cross-dialect correlated UPDATE (no table alias).
    for table in ("competitor_price_observations", "sku_product_links"):
        conn.execute(
            text(
                f"UPDATE {table} "
                f"SET source_run_id = ("
                f"  SELECT e.source_run_id FROM product_entities e "
                f"  WHERE e.id = {table}.entity_id"
                f") "
                f"WHERE (source_run_id IS NULL OR source_run_id = 'user:legacy') "
                f"AND entity_id IN ("
                f"  SELECT id FROM product_entities WHERE source_run_id LIKE 'demo:%'"
                f")"
            )
        )


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
        # source_run_id columns on the core tables — mirror Alembic 0005
        for table, idx in _SOURCE_RUN_ID_TABLES:
            if not _sqlite_table_exists(conn, table):
                continue
            existing_cols = _sqlite_columns(conn, table)
            if "source_run_id" not in existing_cols:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN source_run_id VARCHAR(128)")
                )
            conn.execute(
                text(f"CREATE INDEX IF NOT EXISTS {idx} ON {table} (source_run_id)")
            )
        # Backfill known scopes so the new filter has data to work with
        _apply_source_run_id_backfill(conn)
    logger.info("SQLite additive migrations applied (import provenance + source_run_id)")


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
        # source_run_id data-scope columns + indices — mirror Alembic 0005.
        # This makes the non-Alembic path safe for the new ORM schema: the
        # backend won't start (UndefinedColumn) without these.
        for table, idx in _SOURCE_RUN_ID_TABLES:
            conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS source_run_id VARCHAR(128)")
            )
            conn.execute(
                text(f"CREATE INDEX IF NOT EXISTS {idx} ON {table} (source_run_id)")
            )
        _apply_source_run_id_backfill(conn)
        for table, column in _JSONB_TARGETS:
            _upgrade_to_jsonb(conn, table, column)
    logger.info(
        "Additive migrations applied (run_mode/env, outbox backoff, "
        "JSONB upgrade, source_run_id data-scope)",
    )
