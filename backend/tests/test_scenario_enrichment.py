"""Auto-enrichment: one call → graph + costs + history + pricing recs."""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import (
    CompetitorPriceObservation,
    ProductCost,
    ProductEntity,
    SKUProductLink,
)


def test_auto_enrich_creates_full_stack(db):
    """The one-button-fits-all path: founder uploads CSV → applies rows →
    auto-enrich call lands graph + costs + sales + recommendations."""
    client = TestClient(app)
    payload = {
        "actions": [
            {"sku": "my-coffee-12oz", "product_name": "Premium Coffee 12oz", "approved_price": 8.99},
            {"sku": "my-bread-loaf", "product_name": "Artisan Bread Loaf", "approved_price": 5.49},
        ],
        "store_ids": ["Store-A", "Store-B"],
        "zone_id": "Texas North",
    }
    result = client.post("/api/v1/scenarios/auto-enrich", json=payload)
    assert result.status_code == 201
    body = result.json()
    assert body["bootstrapped_entities"] == 2
    assert body["competitor_observations_created"] == 4  # 2 sources × 2 SKUs
    assert body["product_costs_seeded"] == 2
    # 30 days × 2 stores × 2 SKUs = 120 rows
    assert body["historical_sales_seeded"] == 120
    # Pricing engine should have scanned all our SKU·store combinations.
    # Whether it produced a "change" recommendation depends on whether the
    # current approved_price is already at the constrained optimum — that's
    # the engine's job to decide, not this test's. We only assert the
    # pipeline ran end-to-end.
    assert body["pricing_scanned"] >= 4  # 2 SKUs × 2 stores

    # Verify everything actually landed in the DB
    entities = db.scalars(select(ProductEntity).where(ProductEntity.canonical_title.in_(["Premium Coffee 12oz", "Artisan Bread Loaf"]))).all()
    assert len(entities) == 2
    links = db.scalars(select(SKUProductLink).where(SKUProductLink.sku.in_(["my-coffee-12oz", "my-bread-loaf"]))).all()
    assert len(links) == 2
    costs = db.scalars(select(ProductCost).where(ProductCost.sku.in_(["my-coffee-12oz", "my-bread-loaf"]))).all()
    assert len(costs) == 2
    # Coffee default cost = 8.99 * 0.62 = 5.57
    coffee_cost = next(c for c in costs if c.sku == "my-coffee-12oz")
    assert abs(coffee_cost.cost - 5.57) < 0.02


def test_auto_enrich_is_idempotent(db):
    """Calling auto-enrich twice for the same SKUs should not double-seed."""
    client = TestClient(app)
    payload = {
        "actions": [{"sku": "idem-test", "product_name": "Idempotent Item", "approved_price": 4.00}],
        "store_ids": ["Store-A"],
    }
    first = client.post("/api/v1/scenarios/auto-enrich", json=payload)
    assert first.status_code == 201
    first_body = first.json()
    assert first_body["bootstrapped_entities"] == 1
    assert first_body["historical_sales_seeded"] == 30

    second = client.post("/api/v1/scenarios/auto-enrich", json=payload)
    assert second.status_code == 201
    second_body = second.json()
    assert second_body["bootstrapped_entities"] == 0
    assert second_body["skipped_existing_entities"] == 1
    assert second_body["product_costs_seeded"] == 0  # cost already exists
    assert second_body["historical_sales_seeded"] == 0  # history already exists


def test_auto_enrich_skips_invalid_actions(db):
    """Rows with missing fields or non-positive prices should be silently skipped,
    not crash. (Bulk-import already flagged them as invalid; this is defense in depth.)"""
    client = TestClient(app)
    payload = {
        "actions": [
            {"sku": "", "product_name": "No SKU", "approved_price": 5.00},
            {"sku": "neg-price", "product_name": "Negative", "approved_price": -1.00},
            {"sku": "valid-one", "product_name": "Good Product", "approved_price": 5.00},
        ],
        "store_ids": ["Store-A"],
    }
    result = client.post("/api/v1/scenarios/auto-enrich", json=payload)
    assert result.status_code == 201
    body = result.json()
    assert body["bootstrapped_entities"] == 1  # only the valid one


def test_auto_enrich_requires_actions(db):
    """Empty payload returns 422."""
    client = TestClient(app)
    result = client.post("/api/v1/scenarios/auto-enrich", json={})
    assert result.status_code == 422


def test_auto_enrich_seeds_competitor_observations_around_approved_price(db):
    """Synthetic observations should be +5% (whole_foods_demo) and -2%
    (amazon_fresh_demo) of approved price — same math as the bootstrap
    endpoint so the founder sees consistent numbers."""
    client = TestClient(app)
    payload = {
        "actions": [{"sku": "price-test", "product_name": "Test Item", "approved_price": 10.00}],
        "store_ids": ["Store-A"],
    }
    result = client.post("/api/v1/scenarios/auto-enrich", json=payload)
    assert result.status_code == 201

    entity = db.scalar(select(ProductEntity).where(ProductEntity.canonical_title == "Test Item"))
    assert entity is not None
    obs = db.scalars(
        select(CompetitorPriceObservation).where(CompetitorPriceObservation.entity_id == entity.id)
    ).all()
    assert len(obs) == 2
    prices = sorted(o.price for o in obs)
    # -2% of 10 = 9.80, +5% of 10 = 10.50
    assert prices == [9.80, 10.50]


def test_auto_enrich_pricing_engine_scans_founder_skus(db):
    """The engine must scan SKUs it has cost + history for. Persisted rows
    only happen when there's an actionable change — but the scan count
    proves the founder's SKU reached the engine."""
    client = TestClient(app)
    payload = {
        "actions": [
            {"sku": "elasticity-test", "product_name": "Elasticity Item", "approved_price": 6.00},
        ],
        "store_ids": ["Store-A", "Store-B"],
    }
    enrich = client.post("/api/v1/scenarios/auto-enrich", json=payload)
    assert enrich.status_code == 201
    body = enrich.json()
    # The engine scanned at least our 1 SKU × 2 stores
    assert body["pricing_scanned"] >= 2, f"engine should have scanned the SKU, got {body}"
