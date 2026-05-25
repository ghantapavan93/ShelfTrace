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
