"""Add source_run_id data-scope column across the core tables.

Revision ID: 0005_source_run_id
Revises: 0004_import_provenance

This is the architectural change Codex and Claude flagged in every recent
commit message: the Live/Demo boundary becomes a real backend filter
instead of a frontend hide. Every row that crosses the
demo-showcase / user-uploaded line carries an explicit source_run_id:

  Seeded showcase data:
    'demo:memorial-day'          — the Memorial Day Dallas Zone 2 batch
    'demo:realistic-scale'       — the production-shape preset catalog
    'demo:certification'         — auto-seeded conformance sandbox runs

  User-uploaded data:
    'user:<sha256(csv_bytes)[:16]>'
    'user:manual:<created_at_iso>'

Endpoints can now answer "which scope am I serving?" deterministically
instead of inferring from external_id patterns. Live-mode queries
filter source_run_id LIKE 'user:%'; Demo-mode queries include
everything. Backwards-compatible: NULL means unscoped legacy data.

Applied to: price_batches, product_entities, product_costs,
historical_sales, pricing_recommendations, competitor_price_observations,
sku_product_links. Each gets an indexed source_run_id column.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_source_run_id"
down_revision: Union[str, None] = "0004_import_provenance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tables that get the column. Each entry is (table_name, index_name).
_TABLES = [
    ("price_batches", "ix_price_batches_source_run_id"),
    ("product_entities", "ix_product_entities_source_run_id"),
    ("product_costs", "ix_product_costs_source_run_id"),
    ("historical_sales", "ix_historical_sales_source_run_id"),
    ("pricing_recommendations", "ix_pricing_recommendations_source_run_id"),
    ("competitor_price_observations", "ix_competitor_price_observations_source_run_id"),
    ("sku_product_links", "ix_sku_product_links_source_run_id"),
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table, idx in _TABLES:
            op.execute(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS source_run_id VARCHAR(128)"
            )
            op.execute(
                f"CREATE INDEX IF NOT EXISTS {idx} ON {table} (source_run_id)"
            )
        # Backfill existing rows with sensible defaults so the filter
        # behaves predictably from day one.
        op.execute(
            "UPDATE price_batches SET source_run_id = 'demo:memorial-day' "
            "WHERE source_run_id IS NULL AND external_id = 'memorial-day-dallas-02'"
        )
        op.execute(
            "UPDATE price_batches SET source_run_id = 'demo:realistic-scale' "
            "WHERE source_run_id IS NULL AND external_id = 'realistic-scale-catalog'"
        )
        op.execute(
            "UPDATE price_batches SET source_run_id = 'demo:certification' "
            "WHERE source_run_id IS NULL AND external_id LIKE 'certification-%'"
        )
        op.execute(
            "UPDATE price_batches SET source_run_id = 'user:legacy' "
            "WHERE source_run_id IS NULL"
        )
        # Mark product graph entities seeded by the demo: the Memorial Day
        # showcase entities carry is_manual=true with no bootstrap flag.
        op.execute(
            "UPDATE product_entities SET source_run_id = 'demo:memorial-day' "
            "WHERE source_run_id IS NULL AND is_manual = TRUE"
        )
        op.execute(
            "UPDATE product_entities SET source_run_id = 'user:legacy' "
            "WHERE source_run_id IS NULL"
        )
        # Everything else gets the catch-all 'user:legacy' so Live mode
        # queries that filter source_run_id LIKE 'user:%' return historical
        # uploads, not nothing.
        for table in ("product_costs", "historical_sales", "pricing_recommendations",
                      "competitor_price_observations", "sku_product_links"):
            op.execute(
                f"UPDATE {table} SET source_run_id = 'user:legacy' WHERE source_run_id IS NULL"
            )
        return

    # SQLite path — batch ALTERs
    for table, idx in _TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("source_run_id", sa.String(length=128), nullable=True))
            batch.create_index(idx, ["source_run_id"])

    # Same backfill, dialect-agnostic SQL
    op.execute(
        "UPDATE price_batches SET source_run_id = 'demo:memorial-day' "
        "WHERE source_run_id IS NULL AND external_id = 'memorial-day-dallas-02'"
    )
    op.execute(
        "UPDATE price_batches SET source_run_id = 'demo:realistic-scale' "
        "WHERE source_run_id IS NULL AND external_id = 'realistic-scale-catalog'"
    )
    op.execute(
        "UPDATE price_batches SET source_run_id = 'demo:certification' "
        "WHERE source_run_id IS NULL AND external_id LIKE 'certification-%'"
    )
    op.execute(
        "UPDATE price_batches SET source_run_id = 'user:legacy' "
        "WHERE source_run_id IS NULL"
    )
    op.execute(
        "UPDATE product_entities SET source_run_id = 'demo:memorial-day' "
        "WHERE source_run_id IS NULL AND is_manual = 1"
    )
    op.execute(
        "UPDATE product_entities SET source_run_id = 'user:legacy' "
        "WHERE source_run_id IS NULL"
    )
    for table in ("product_costs", "historical_sales", "pricing_recommendations",
                  "competitor_price_observations", "sku_product_links"):
        op.execute(
            f"UPDATE {table} SET source_run_id = 'user:legacy' WHERE source_run_id IS NULL"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table, idx in _TABLES:
            op.execute(f"DROP INDEX IF EXISTS {idx}")
            op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS source_run_id")
        return

    for table, idx in _TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_index(idx)
            batch.drop_column("source_run_id")
