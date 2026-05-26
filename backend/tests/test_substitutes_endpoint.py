"""Substitutes endpoint — surfaces cross-elasticity neighbours per entity.

Wires the cannibalization heuristic into a public API so the product-graph
UI can show "if you raise this entity's price, here's what'll absorb the
volume." The math is heuristic; this test asserts the wiring, not the
quality of the elasticity estimate.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    HistoricalSale,
    ProductCategory,
    ProductEntity,
    SKUProductLink,
)


def _seed_entity_with_history(db, *, entity_id, sku, title, category_id, prices):
    """Create an entity + SKU link + N days of price history."""
    db.add(ProductEntity(
        id=entity_id,
        canonical_title=title,
        category_id=category_id,
        is_manual=True,
        match_confidence=1.0,
    ))
    db.flush()
    db.add(SKUProductLink(
        id=f"link_{sku}",
        sku=sku,
        entity_id=entity_id,
        zone_id=None,
    ))
    now = datetime.now(timezone.utc)
    for i, price in enumerate(prices):
        db.add(HistoricalSale(
            id=f"hist_{sku}_{i}",
            sku=sku,
            store_id="S1",
            date=now - timedelta(days=len(prices) - i),
            price=price,
            units_sold=max(1, int(100 / max(price, 0.01))),
            on_promotion=False,
        ))


def test_substitutes_endpoint_returns_shape(db):
    """Endpoint returns entity + substitutes array with required fields."""
    cat = ProductCategory(id="cat_dairy", name="Dairy")
    db.add(cat)
    db.flush()

    _seed_entity_with_history(
        db,
        entity_id="ent_milk_a", sku="milk-a", title="Milk A",
        category_id=cat.id, prices=[5.99, 5.79, 5.49, 5.99, 5.99, 5.99],
    )
    _seed_entity_with_history(
        db,
        entity_id="ent_milk_b", sku="milk-b", title="Milk B",
        category_id=cat.id, prices=[3.99, 3.99, 3.99, 3.79, 3.79, 3.79],
    )
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/product-graph/entities/ent_milk_a/substitutes")
    assert res.status_code == 200
    body = res.json()
    assert body["entity"]["id"] == "ent_milk_a"
    assert "substitutes" in body
    assert "note" in body
    # Each row carries the kind classification + elasticity number
    for row in body["substitutes"]:
        assert "kind" in row
        assert row["kind"] in {
            "substitute", "weak_substitute", "complement", "weak_complement", "unrelated",
        }
        assert "estimated_cross_elasticity" in row
        assert "confidence" in row


def test_substitutes_endpoint_404_for_unknown_entity(db):
    client = TestClient(app)
    res = client.get("/api/v1/product-graph/entities/does-not-exist/substitutes")
    assert res.status_code == 404


def test_substitutes_endpoint_empty_when_no_neighbours(db):
    """An isolated entity (no other entities in its category) returns []."""
    cat = ProductCategory(id="cat_solo", name="Solo")
    db.add(cat)
    db.flush()
    _seed_entity_with_history(
        db,
        entity_id="ent_solo", sku="solo-1", title="Solo Item",
        category_id=cat.id, prices=[5.0, 5.0, 5.0, 5.0],
    )
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/product-graph/entities/ent_solo/substitutes")
    assert res.status_code == 200
    assert res.json()["substitutes"] == []
