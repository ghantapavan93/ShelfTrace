"""Reclassify mislabeled demo seed rows out of Live scope.

Revision ID: 0007_reclassify_demo_seed
Revises: 0006_external_signal_scope

The 0005 backfill blanket-mapped every NULL source_run_id to 'user:legacy'.
But the Memorial Day seed catalog (costs / history / recommendations) was
written by seed_history() BEFORE that loader stamped source_run_id — so those
demo rows became 'user:legacy', and Scope.LIVE (which includes user:legacy)
surfaced them in Live mode. That broke the contract that Live shows ZERO
seeded data.

This corrects the classification: rows whose scope is NULL or exactly
'user:legacy' AND whose SKU is a known Memorial Day demo SKU become
'demo:memorial-day'. Graph rows (competitor observations, SKU links) inherit
their linked entity's demo scope. Genuine user uploads carry a 'user:<hash>'
tag and are never touched.

Idempotent: once rows are demo:*, the WHERE clause matches nothing.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0007_reclassify_demo_seed"
down_revision: Union[str, None] = "0006_external_signal_scope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Memorial Day demo SKUs (seed.py PROFILES + create_memorial_day actions).
_MD_SKUS = (
    "milk-organic-1gal",
    "egg-cage-free-brown-12",
    "strawberry-1lb",
    "oj-nfc-premium-52oz",
)
_SKU_TABLES = ("product_costs", "historical_sales", "pricing_recommendations")
_GRAPH_TABLES = ("competitor_price_observations", "sku_product_links")


def _sku_in_list() -> str:
    return ", ".join(f"'{s}'" for s in _MD_SKUS)


def upgrade() -> None:
    sku_list = _sku_in_list()
    for table in _SKU_TABLES:
        op.execute(
            f"UPDATE {table} SET source_run_id = 'demo:memorial-day' "
            f"WHERE (source_run_id IS NULL OR source_run_id = 'user:legacy') "
            f"AND sku IN ({sku_list})"
        )
    # Graph rows inherit their entity's demo scope (no SKU on the row).
    for table in _GRAPH_TABLES:
        op.execute(
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


def downgrade() -> None:
    # Non-reversible data correction — re-tagging demo rows back to user:legacy
    # would re-introduce the leak. No-op downgrade by design.
    pass
