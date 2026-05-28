"""Regression: demo seed rows mislabeled 'user:legacy' must be reclassified to
demo:* so Live mode shows ZERO seeded data.

Reproduces the production leak: Memorial Day costs / history / recommendations
written before the loaders stamped source_run_id were backfilled to
'user:legacy', and Scope.LIVE (which includes user:legacy) surfaced them. The
reclassifier corrects them while leaving genuine user uploads untouched.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.db_migrate import _reclassify_demo_rows
from app.models import (
    HistoricalSale,
    PriceAction,
    PriceBatch,
    PricingRecommendation,
    ProductCost,
    RunMode,
    Environment,
)


def _legacy_cost(db, sku):
    db.add(ProductCost(id=f"c_{sku}", sku=sku, cost=2.0, source_run_id="user:legacy"))


def test_reclassify_retags_memorial_day_demo_rows(db):
    # Demo SKU rows mislabeled user:legacy (the production bug)
    _legacy_cost(db, "egg-cage-free-brown-12")
    db.add(HistoricalSale(
        id="h_demo", sku="strawberry-1lb", store_id="214",
        date=datetime.now(timezone.utc), price=2.99, units_sold=40,
        on_promotion=False, source_run_id="user:legacy",
    ))
    db.add(PricingRecommendation(
        id="r_demo", sku="oj-nfc-premium-52oz", store_id="401",
        product_name="OJ", current_price=9.49, recommended_price=8.99,
        source_run_id="user:legacy", applied=False, superseded_by=None,
    ))
    # A genuine user upload that must NOT be touched
    db.add(ProductCost(id="c_user", sku="my-craft-soda", cost=1.0, source_run_id="user:abc123"))
    # A NULL row for a demo SKU (pre-backfill) — also reclassified
    db.add(ProductCost(id="c_null", sku="milk-organic-1gal", cost=2.5, source_run_id=None))
    db.commit()

    _reclassify_demo_rows(db.connection())
    db.commit()
    db.expire_all()

    # demo SKU rows → demo:memorial-day (cost id is f"c_{sku}")
    assert db.get(ProductCost, "c_egg-cage-free-brown-12").source_run_id == "demo:memorial-day"
    assert db.get(HistoricalSale, "h_demo").source_run_id == "demo:memorial-day"
    assert db.get(PricingRecommendation, "r_demo").source_run_id == "demo:memorial-day"
    assert db.get(ProductCost, "c_null").source_run_id == "demo:memorial-day"
    # genuine user upload untouched
    assert db.get(ProductCost, "c_user").source_run_id == "user:abc123"


def test_reclassified_rows_disappear_from_live_scope(db):
    """End-to-end: after reclassification a demo cost no longer appears under
    ?scope=live, but a genuine user cost still does."""
    _legacy_cost(db, "egg-cage-free-brown-12")
    db.add(ProductCost(id="c_user", sku="my-craft-soda", cost=1.0, source_run_id="user:abc123"))
    db.commit()

    client = TestClient(app)
    before = {c["sku"] for c in client.get("/api/v1/pricing/costs?scope=live").json()["costs"]}
    assert "egg-cage-free-brown-12" in before  # leaking pre-fix

    _reclassify_demo_rows(db.connection())
    db.commit()

    after_live = {c["sku"] for c in client.get("/api/v1/pricing/costs?scope=live").json()["costs"]}
    after_demo = {c["sku"] for c in client.get("/api/v1/pricing/costs?scope=demo").json()["costs"]}
    assert "egg-cage-free-brown-12" not in after_live  # leak closed
    assert "my-craft-soda" in after_live               # genuine user data stays
    assert "egg-cage-free-brown-12" in after_demo       # now correctly demo


def test_reclassify_is_idempotent(db):
    _legacy_cost(db, "milk-organic-1gal")
    db.commit()
    _reclassify_demo_rows(db.connection())
    db.commit()
    _reclassify_demo_rows(db.connection())  # second run = no-op
    db.commit()
    assert db.get(ProductCost, "c_milk-organic-1gal").source_run_id == "demo:memorial-day"
