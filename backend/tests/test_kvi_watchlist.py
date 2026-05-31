"""KVI watchlist endpoint — surfaces KVI-flagged SKUs with competitor gap.

The watchlist is read-only: it pulls latest PriceActions flagged is_kvi=True,
joins each one to the product graph's most recent competitor reference, and
classifies the gap against the ±1.5% tolerance band.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    PriceAction,
    PriceBatch,
    ProductEntity,
    SKUProductLink,
    Environment,
    RunMode,
)


def _seed_kvi_with_competitor(db, *, sku, store_id, our_price, comp_price, source_id="whole_foods_demo"):
    """Create a KVI PriceAction + a competitor observation linked via the graph."""
    batch = PriceBatch(
        id=f"batch_{sku}_{store_id}",
        external_id=f"ext_{sku}_{store_id}",
        idempotency_key=f"idem_{sku}_{store_id}",
        name="KVI test batch",
        zone="Test Zone",
        approved_by="test",
        total_store_count=1,
        run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION,
    )
    db.add(batch)
    db.flush()

    action = PriceAction(
        id=f"act_{sku}_{store_id}",
        batch_id=batch.id,
        sku=sku,
        store_id=store_id,
        product_name=f"Product {sku}",
        approved_price=our_price,
        prior_price=our_price * 1.05,
        reason="KVI test",
        is_kvi=True,
        is_perishable=False,
    )
    db.add(action)

    entity = ProductEntity(
        id=f"ent_{sku}",
        canonical_title=f"Canonical {sku}",
        brand="Test",
        unit_size="1 ct",
        is_manual=True,
        match_confidence=1.0,
    )
    db.add(entity)
    db.flush()

    db.add(SKUProductLink(
        id=f"link_{sku}",
        sku=sku,
        entity_id=entity.id,
        zone_id=None,
    ))

    cp = CompetitorProduct(
        id=f"cp_{sku}",
        source_id=source_id,
        external_id=f"{source_id}_{sku}",
        stable_key=f"{source_id}:{sku}",
        title=f"Competitor {sku}",
        price=comp_price,
        currency="USD",
        availability="in_stock",
        raw_attributes={},
    )
    db.add(cp)
    db.flush()  # parent competitor_products row must exist before FK children (PG enforces FKs; SQLite doesn't)
    db.add(CompetitorProductEntity(
        id=f"cpe_{sku}",
        competitor_product_id=cp.id,
        entity_id=entity.id,
        match_score=0.95,
    ))
    db.add(CompetitorPriceObservation(
        id=f"obs_{sku}",
        competitor_product_id=cp.id,
        entity_id=entity.id,
        price=comp_price,
        currency="USD",
        zone_id=None,
        store_id=None,
        observed_at=datetime.now(timezone.utc),
        delta_pct=round((comp_price - our_price) / our_price * 100, 2),
    ))
    db.commit()


def test_kvi_watchlist_returns_within_band_for_aligned_kvi(db):
    """A KVI priced within ±1.5% of competitor sits 'within' the band."""
    _seed_kvi_with_competitor(db, sku="eggs", store_id="214", our_price=4.19, comp_price=4.20)

    client = TestClient(app)
    res = client.get("/api/v1/pricing/kvi-watchlist")
    assert res.status_code == 200
    body = res.json()
    assert body["tolerance_pct"] == 1.5
    assert body["summary"]["total"] == 1
    assert body["summary"]["within_band"] == 1
    item = body["items"][0]
    assert item["sku"] == "eggs"
    assert item["band"] == "within"
    assert abs(item["gap_pct"]) <= 1.5
    assert item["competitor_source"] == "whole_foods_demo"


def test_kvi_watchlist_flags_above_band(db):
    """A KVI priced >1.5% above competitor lands in the 'above' band."""
    _seed_kvi_with_competitor(db, sku="oj", store_id="302", our_price=9.99, comp_price=8.99)

    client = TestClient(app)
    res = client.get("/api/v1/pricing/kvi-watchlist")
    assert res.status_code == 200
    body = res.json()
    assert body["summary"]["above_band"] == 1
    assert body["items"][0]["band"] == "above"
    assert body["items"][0]["gap_pct"] > 1.5


def test_kvi_watchlist_sorts_by_abs_gap_desc(db):
    """Items furthest off-strategy bubble to the top."""
    _seed_kvi_with_competitor(db, sku="milk", store_id="A", our_price=5.99, comp_price=5.99)  # within
    _seed_kvi_with_competitor(db, sku="eggs", store_id="A", our_price=4.99, comp_price=4.19)  # ~+19%
    _seed_kvi_with_competitor(db, sku="oj", store_id="A", our_price=8.49, comp_price=8.99)    # ~-5.5%

    client = TestClient(app)
    res = client.get("/api/v1/pricing/kvi-watchlist")
    assert res.status_code == 200
    skus = [it["sku"] for it in res.json()["items"]]
    # eggs (~19%) first, then oj (~-5.5%), then milk (~0%)
    assert skus[0] == "eggs"
    assert skus[1] == "oj"
    assert skus[2] == "milk"


def test_kvi_watchlist_excludes_non_kvi_actions(db):
    """Non-KVI actions never appear, even when they have a competitor link."""
    _seed_kvi_with_competitor(db, sku="kvi-item", store_id="A", our_price=5.0, comp_price=5.0)

    # Non-KVI action manually inserted in the same shape (just is_kvi=False)
    batch = PriceBatch(
        id="batch_nonkvi", external_id="ext_nonkvi", idempotency_key="idem_nonkvi",
        name="Non-KVI batch", zone="z", approved_by="t", total_store_count=1,
        run_mode=RunMode.LIVE_ROLLOUT, environment=Environment.SIMULATED_PRODUCTION,
    )
    db.add(batch)
    db.flush()
    db.add(PriceAction(
        id="act_nonkvi", batch_id=batch.id, sku="nonkvi-item", store_id="A",
        product_name="Non-KVI", approved_price=5.0, prior_price=5.0, reason="not KVI",
        is_kvi=False, is_perishable=False,
    ))
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/pricing/kvi-watchlist")
    skus = [it["sku"] for it in res.json()["items"]]
    assert "kvi-item" in skus
    assert "nonkvi-item" not in skus


def test_kvi_watchlist_handles_no_competitor_reference(db):
    """A KVI with no graph linkage lands in 'no_competitor' and sinks to the bottom."""
    # KVI action with NO entity link
    batch = PriceBatch(
        id="batch_orphan", external_id="ext_orphan", idempotency_key="idem_orphan",
        name="Orphan batch", zone="z", approved_by="t", total_store_count=1,
        run_mode=RunMode.LIVE_ROLLOUT, environment=Environment.SIMULATED_PRODUCTION,
    )
    db.add(batch)
    db.flush()
    db.add(PriceAction(
        id="act_orphan", batch_id=batch.id, sku="orphan-kvi", store_id="A",
        product_name="Orphan KVI", approved_price=5.0, prior_price=5.0, reason="orphan",
        is_kvi=True, is_perishable=False,
    ))
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/pricing/kvi-watchlist")
    assert res.status_code == 200
    body = res.json()
    item = body["items"][0]
    assert item["band"] == "no_competitor"
    assert item["competitor_price"] is None
    assert item["gap_pct"] is None


def test_kvi_watchlist_empty_when_no_kvi_actions(db):
    """Empty payload is well-formed (summary present, items=[])."""
    client = TestClient(app)
    res = client.get("/api/v1/pricing/kvi-watchlist")
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["summary"]["total"] == 0
