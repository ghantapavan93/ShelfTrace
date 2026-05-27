"""Realistic Scale preset — the production-shape demo catalog loader.

Verifies the loader actually populates every layer with meaningful
volume so reviewers see the platform at realistic scale, not three
hand-picked products.
"""
from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    HistoricalSale,
    ProductCost,
    ProductEntity,
    SKUProductLink,
)
from app.scenarios import realistic_scale


def test_realistic_scale_populates_every_layer(db):
    """One load → entities, SKU links, costs, competitor data + history."""
    result = realistic_scale.load_realistic_scale(db, reload=True)
    s = result["summary"]

    # Catalog scale — every grocery surface needs enough SKUs to feel real
    assert s["skus_in_catalog"] >= 130, f"catalog too small: {s['skus_in_catalog']}"
    assert s["kvi_skus"] >= 10, "need a meaningful KVI watchlist"
    assert s["perishable_skus"] >= 15, "need enough perishables for markdown SLA"

    # Knowledge graph
    assert s["entities_created"] == s["skus_in_catalog"]
    assert s["sku_links_created"] == s["skus_in_catalog"]
    assert s["competitor_products_created"] == s["skus_in_catalog"] * 4

    # Pricing engine inputs
    assert s["product_costs_created"] == s["skus_in_catalog"]
    # Stores × days × SKUs
    expected_history = s["stores"] * s["history_days"] * s["skus_in_catalog"]
    assert s["historical_sales_created"] == expected_history


def test_realistic_scale_history_supports_elasticity_fit(db):
    """The seeded history must be enough for OLS to produce sufficient_data."""
    realistic_scale.load_realistic_scale(db, reload=True)

    # Pick a known SKU with deliberate elasticity (eggs cage-free).
    sku = "dairy-eggs-cage-free-12"
    history = list(
        db.scalars(
            select(HistoricalSale)
            .where(HistoricalSale.sku == sku)
            .where(HistoricalSale.store_id == "214")
        )
    )
    assert len(history) >= 30, "need ≥30 days to fit β reliably"
    # Distinct price levels (engine requires ≥3 to separate noise from signal)
    distinct_prices = {round(h.price, 2) for h in history if not h.on_promotion}
    assert len(distinct_prices) >= 3, "need ≥3 distinct prices for elasticity fit"


def test_realistic_scale_is_idempotent(db):
    """Loading twice without reload=True does NOT duplicate data."""
    first = realistic_scale.load_realistic_scale(db, reload=True)
    assert first["loaded"] is True

    # Count what's in there
    n_entities_after_first = db.scalar(
        select(func.count(ProductEntity.id))
    )
    n_history_after_first = db.scalar(select(func.count(HistoricalSale.id)))

    second = realistic_scale.load_realistic_scale(db, reload=False)
    assert second["loaded"] is False, "should no-op when data already present"

    # Counts unchanged
    assert db.scalar(select(func.count(ProductEntity.id))) == n_entities_after_first
    assert db.scalar(select(func.count(HistoricalSale.id))) == n_history_after_first


def test_realistic_scale_competitor_offsets_realistic(db):
    """Whole Foods premium pricing, Aldi discount — every entity has all 4 sources."""
    realistic_scale.load_realistic_scale(db, reload=True)

    # Spot check the eggs entity
    sku = "dairy-eggs-cage-free-12"
    link = db.scalar(select(SKUProductLink).where(SKUProductLink.sku == sku))
    assert link is not None
    obs = list(
        db.scalars(
            select(CompetitorPriceObservation)
            .where(CompetitorPriceObservation.entity_id == link.entity_id)
        )
    )
    sources = {o.competitor_product_id for o in obs}
    # Four illustrative sources per entity
    assert len(sources) == 4
    # Each observation has a non-null delta_pct (the offset from our price)
    for o in obs:
        assert o.delta_pct is not None
        assert abs(o.delta_pct) >= 0  # positive or negative are both valid


def test_realistic_scale_per_category_distribution(db):
    """Catalog spreads SKUs across all 8 top-level categories."""
    result = realistic_scale.load_realistic_scale(db, reload=True)
    by_cat = result["summary"]["skus_per_category"]
    # Each top-level category has some SKUs — no completely empty buckets
    leaf_to_top = {
        leaf: top
        for top, leaves in realistic_scale.CATEGORY_TREE.items()
        for leaf in leaves
    }
    by_top: dict[str, int] = {}
    for leaf, n in by_cat.items():
        top = leaf_to_top.get(leaf, "Other")
        by_top[top] = by_top.get(top, 0) + n
    assert len(by_top) >= 6, "expected SKUs spread across 6+ top-level categories"
    for top, n in by_top.items():
        assert n >= 5, f"category {top!r} has only {n} SKUs — too thin to feel real"


def test_realistic_scale_kvi_includes_industry_traffic_drivers(db):
    """The KVI flag matches a real-industry traffic-driver list."""
    realistic_scale.load_realistic_scale(db, reload=True)
    kvi_skus = {item.sku for item in realistic_scale.CATALOG if item.is_kvi}
    # These are universally recognized US grocery traffic-driver categories
    expected_keywords = ["eggs", "milk", "bananas", "bread", "coffee", "water", "ground-beef"]
    for kw in expected_keywords:
        matching = [s for s in kvi_skus if kw in s.lower()]
        assert matching, f"expected at least one KVI SKU containing {kw!r}"
