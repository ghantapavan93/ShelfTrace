"""API tests for /api/v1/product-graph endpoints — seed, lookup, list."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_seed_demo_graph_creates_entities(db):
    client = TestClient(app)
    result = client.post("/api/v1/product-graph/seed-demo")
    assert result.status_code == 201
    body = result.json()
    assert body["seeded"] is True
    assert body["entities"] == 3
    assert body["sku_links"] == 3
    assert body["observations"] == 6


def test_seed_demo_graph_is_idempotent(db):
    client = TestClient(app)
    client.post("/api/v1/product-graph/seed-demo")
    second = client.post("/api/v1/product-graph/seed-demo")
    assert second.status_code == 201
    body = second.json()
    assert body["seeded"] is False
    assert "already seeded" in body["note"].lower()


def test_list_entities_includes_counts(db):
    client = TestClient(app)
    client.post("/api/v1/product-graph/seed-demo")
    result = client.get("/api/v1/product-graph/entities")
    assert result.status_code == 200
    body = result.json()
    assert body["total"] >= 3
    for entity in body["entities"]:
        assert "linked_sku_count" in entity
        assert "competitor_observation_count" in entity
        # Each demo entity has 1 SKU link and 2 observations (whole_foods + amazon)
        if entity["canonical_title"] in (
            "Cage-Free Large Brown Eggs",
            "Fresh Strawberries",
            "Premium Not-From-Concentrate Orange Juice",
        ):
            assert entity["linked_sku_count"] == 1
            assert entity["competitor_observation_count"] == 2


def test_competitor_prices_by_sku(db):
    client = TestClient(app)
    client.post("/api/v1/product-graph/seed-demo")
    result = client.get("/api/v1/product-graph/sku/egg-cage-free-brown-12/competitor-prices")
    assert result.status_code == 200
    body = result.json()
    assert body["sku"] == "egg-cage-free-brown-12"
    assert body["entity_id"] is not None
    assert body["canonical_title"] == "Cage-Free Large Brown Eggs"
    assert len(body["observations"]) == 2
    sources = {o["source_id"] for o in body["observations"]}
    assert sources == {"whole_foods_demo", "amazon_fresh_demo"}


def test_competitor_prices_for_unknown_sku(db):
    client = TestClient(app)
    result = client.get("/api/v1/product-graph/sku/totally-unknown-sku/competitor-prices")
    assert result.status_code == 200
    body = result.json()
    assert body["sku"] == "totally-unknown-sku"
    assert body["entity_id"] is None
    assert body["observations"] == []


def test_categories_returns_hierarchy(db):
    client = TestClient(app)
    client.post("/api/v1/product-graph/seed-demo")
    result = client.get("/api/v1/product-graph/categories")
    assert result.status_code == 200
    body = result.json()
    assert len(body["categories"]) == 3
    names = {c["name"] for c in body["categories"]}
    assert names == {"Dairy & Eggs", "Produce", "Beverages"}


def test_pricing_suggest_returns_none_when_no_history(db):
    client = TestClient(app)
    result = client.get("/api/v1/pricing/sku/unknown-sku/suggest")
    assert result.status_code == 200
    body = result.json()
    assert body["sku"] == "unknown-sku"
    assert body["recommendation"] is None


def test_mode_endpoint_returns_demo_mode():
    """Founder needs to see at a glance whether they're in demo or live mode."""
    client = TestClient(app)
    result = client.get("/api/v1/mode")
    assert result.status_code == 200
    body = result.json()
    assert body["mode"] in ("demo", "live")
    assert body["label"] in ("DEMO MODE", "LIVE MODE")
    assert body["tone"] in ("violet", "rose")
    assert "description" in body
    assert "details" in body


def test_bootstrap_from_scenario_creates_entities_and_observations(db):
    """The killer demo feature: upload a CSV with brand-new SKUs, click
    'Bootstrap graph', and the hint pills populate with synthetic competitor
    data immediately. This test locks in that flow."""
    client = TestClient(app)
    payload = {
        "actions": [
            {"sku": "my-coffee-12oz", "product_name": "Premium Coffee 12oz", "approved_price": 8.99},
            {"sku": "my-bread-loaf", "product_name": "Artisan Bread Loaf", "approved_price": 5.49},
        ],
        "zone_id": "Texas North",
    }
    result = client.post("/api/v1/product-graph/bootstrap-from-scenario", json=payload)
    assert result.status_code == 201
    body = result.json()
    assert body["bootstrapped_entities"] == 2
    assert body["competitor_observations_created"] == 4  # 2 sources × 2 SKUs
    assert body["skipped_already_linked"] == 0

    # Verify competitor prices show up for one of the SKUs
    look = client.get("/api/v1/product-graph/sku/my-coffee-12oz/competitor-prices")
    assert look.status_code == 200
    obs = look.json()["observations"]
    assert len(obs) == 2
    sources = {o["source_id"] for o in obs}
    assert sources == {"whole_foods_demo", "amazon_fresh_demo"}
    # Prices should be ±5% / ±2% of 8.99
    wf_obs = next(o for o in obs if o["source_id"] == "whole_foods_demo")
    af_obs = next(o for o in obs if o["source_id"] == "amazon_fresh_demo")
    assert abs(wf_obs["price"] - 8.99 * 1.05) < 0.01
    assert abs(af_obs["price"] - 8.99 * 0.98) < 0.01


def test_bootstrap_is_idempotent(db):
    """Calling bootstrap twice with same SKUs should skip the second time."""
    client = TestClient(app)
    payload = {"actions": [{"sku": "dup-test", "product_name": "Test Item", "approved_price": 5.00}]}
    first = client.post("/api/v1/product-graph/bootstrap-from-scenario", json=payload)
    assert first.status_code == 201
    assert first.json()["bootstrapped_entities"] == 1

    second = client.post("/api/v1/product-graph/bootstrap-from-scenario", json=payload)
    assert second.status_code == 201
    body = second.json()
    assert body["bootstrapped_entities"] == 0
    assert body["skipped_already_linked"] == 1


def test_bootstrap_rejects_invalid_input(db):
    """Missing fields should skip the row, not crash."""
    client = TestClient(app)
    payload = {
        "actions": [
            {"sku": "", "product_name": "No SKU", "approved_price": 5.00},
            {"sku": "valid-sku", "product_name": "", "approved_price": 5.00},
            {"sku": "neg-price", "product_name": "Negative", "approved_price": -1.00},
            {"sku": "good-one", "product_name": "Good Product", "approved_price": 5.00},
        ],
    }
    result = client.post("/api/v1/product-graph/bootstrap-from-scenario", json=payload)
    assert result.status_code == 201
    body = result.json()
    assert body["bootstrapped_entities"] == 1
    assert body["skipped_invalid_input"] == 3


def test_bootstrap_requires_actions_list(db):
    """Empty payload returns 422."""
    client = TestClient(app)
    result = client.post("/api/v1/product-graph/bootstrap-from-scenario", json={})
    assert result.status_code == 422
