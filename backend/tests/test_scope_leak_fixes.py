"""Regression tests for the second-round Live/Demo scope-leak fixes.

Each test below pins a specific leak that a high-recall code review surfaced
after the initial source_run_id rollout. The common failure mode: an endpoint
correctly scope-filtered its *primary* query but then pulled a *secondary*
table (costs, history, recs, competitor obs, derived counts) unfiltered —
letting demo rows bleed into a Live-mode view (or vice versa).

The contract under test, stated once: when a caller asks for ?scope=live, NO
demo-seeded row may influence the response — not as a row, not as a count, not
as a cost basis, not as a competitor reference, not as a CSV line.
"""
from __future__ import annotations

import csv
import io

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    Environment,
    HistoricalSale,
    PriceAction,
    PriceBatch,
    PricingRecommendation,
    ProductCost,
    ProductEntity,
    RunMode,
    SKUProductLink,
    utcnow,
)
from app.scope import DEMO_MEMORIAL_DAY


# ──────────────────────────────────────────────────────────────────────
# Shared builders
# ──────────────────────────────────────────────────────────────────────
def _make_batch(db, *, suffix: str, source_run_id: str | None) -> PriceBatch:
    batch = PriceBatch(
        id=f"batch_{suffix}",
        external_id=f"ext_{suffix}",
        idempotency_key=f"idem_{suffix}",
        name=f"Scope test batch {suffix}",
        zone="Test Zone",
        approved_by="test",
        total_store_count=1,
        run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION,
        source_run_id=source_run_id,
    )
    db.add(batch)
    db.flush()
    return batch


def _seed_kvi_action(db, *, batch_id, sku, store_id, price, cost, source_run_id):
    db.add(PriceAction(
        id=f"act_{sku}_{store_id}",
        batch_id=batch_id,
        sku=sku,
        store_id=store_id,
        product_name=f"Product {sku}",
        approved_price=price,
        prior_price=price,
        reason="test",
        is_kvi=True,
    ))
    db.add(ProductCost(id=f"cost_{sku}", sku=sku, cost=cost, source_run_id=source_run_id))


def _make_rec(db, *, suffix, sku, store_id, source_run_id):
    db.add(PricingRecommendation(
        id=f"prec_{suffix}",
        sku=sku,
        store_id=store_id,
        product_name=f"Product {sku}",
        current_price=10.0,
        recommended_price=11.0,  # != current so only_changes keeps it
        source_run_id=source_run_id,
        applied=False,
        superseded_by=None,
    ))


# ──────────────────────────────────────────────────────────────────────
# /operations — scope=live must NOT fall back to the demo batch
# ──────────────────────────────────────────────────────────────────────
def test_operations_scope_live_404_when_only_demo_batch_exists(db):
    """The headline leak: a Live-mode user with no live batch used to get the
    seeded Memorial Day batch rendered under the Live header, because the
    no-match fallback returned the unfiltered latest batch."""
    _make_batch(db, suffix="demo_only", source_run_id=DEMO_MEMORIAL_DAY)
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/operations?scope=live")
    assert res.status_code == 404
    assert "scope" in res.json()["detail"].lower()


def test_operations_scope_all_still_falls_back(db):
    """Scope.ALL (the reviewer 'show me anything' default) keeps the fallback
    so the page renders something rather than 404-ing."""
    # Build a real-ish batch the overview can render: one action, one group.
    batch = _make_batch(db, suffix="all_fallback", source_run_id=DEMO_MEMORIAL_DAY)
    _seed_kvi_action(db, batch_id=batch.id, sku="eggs", store_id="A",
                     price=4.0, cost=2.0, source_run_id=DEMO_MEMORIAL_DAY)
    db.commit()

    client = TestClient(app)
    # scope=all → should NOT 404 (it resolves the demo batch as the fallback).
    res = client.get("/api/v1/operations?scope=all")
    assert res.status_code == 200


def test_operations_external_id_bypasses_scope(db):
    """The documented escape hatch: an explicit external_id returns that batch
    regardless of scope, so a Live-mode user can still inspect the demo batch
    by direct link."""
    batch = _make_batch(db, suffix="escape", source_run_id=DEMO_MEMORIAL_DAY)
    _seed_kvi_action(db, batch_id=batch.id, sku="eggs", store_id="A",
                     price=4.0, cost=2.0, source_run_id=DEMO_MEMORIAL_DAY)
    db.commit()

    client = TestClient(app)
    res = client.get(f"/api/v1/operations?external_id={batch.external_id}&scope=live")
    assert res.status_code == 200


# ──────────────────────────────────────────────────────────────────────
# /pricing/recommendations/export.csv — must honor ?scope=
# ──────────────────────────────────────────────────────────────────────
def test_export_csv_scope_live_excludes_demo_recs(db):
    _make_rec(db, suffix="demo", sku="demo-sku", store_id="A", source_run_id=DEMO_MEMORIAL_DAY)
    _make_rec(db, suffix="user", sku="user-sku", store_id="A", source_run_id="user:abc123")
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/pricing/recommendations/export.csv?scope=live")
    assert res.status_code == 200
    rows = list(csv.DictReader(io.StringIO(res.text)))
    skus = {r["sku"] for r in rows}
    assert "user-sku" in skus
    assert "demo-sku" not in skus


def test_export_csv_default_scope_returns_all(db):
    _make_rec(db, suffix="demo", sku="demo-sku", store_id="A", source_run_id=DEMO_MEMORIAL_DAY)
    _make_rec(db, suffix="user", sku="user-sku", store_id="A", source_run_id="user:abc123")
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/pricing/recommendations/export.csv")
    assert res.status_code == 200
    skus = {r["sku"] for r in csv.DictReader(io.StringIO(res.text))}
    assert {"demo-sku", "user-sku"}.issubset(skus)


# ──────────────────────────────────────────────────────────────────────
# /pricing/margin-targets — costs + history must be scope-filtered
# ──────────────────────────────────────────────────────────────────────
def test_margin_targets_scope_live_ignores_demo_cost(db):
    """A demo SKU's cost must not set the cost basis for a Live rollup.

    Two KVI actions in two scopes share NOTHING here, but the bug was that
    margin-targets loaded ALL ProductCost rows. We assert the Live rollup
    only sees the user SKU (1 with cost), not the demo SKU."""
    demo_batch = _make_batch(db, suffix="mt_demo", source_run_id=DEMO_MEMORIAL_DAY)
    user_batch = _make_batch(db, suffix="mt_user", source_run_id="user:abc123")
    _seed_kvi_action(db, batch_id=demo_batch.id, sku="demo-kvi", store_id="A",
                     price=5.0, cost=4.5, source_run_id=DEMO_MEMORIAL_DAY)
    _seed_kvi_action(db, batch_id=user_batch.id, sku="user-kvi", store_id="A",
                     price=5.0, cost=4.5, source_run_id="user:abc123")
    db.commit()

    client = TestClient(app)
    live = client.get("/api/v1/pricing/margin-targets?scope=live").json()
    kvi_live = next(c for c in live["categories"] if c["policy"] == "kvi")
    # Only the user KVI action is in scope.
    assert kvi_live["n_skus"] == 1
    assert kvi_live["n_with_cost"] == 1

    demo = client.get("/api/v1/pricing/margin-targets?scope=demo").json()
    kvi_demo = next(c for c in demo["categories"] if c["policy"] == "kvi")
    assert kvi_demo["n_skus"] == 1

    all_ = client.get("/api/v1/pricing/margin-targets").json()
    kvi_all = next(c for c in all_["categories"] if c["policy"] == "kvi")
    assert kvi_all["n_skus"] == 2


# ──────────────────────────────────────────────────────────────────────
# /product-graph/entities — derived counts must be scope-filtered
# ──────────────────────────────────────────────────────────────────────
def test_entity_counts_respect_scope(db):
    """An entity may have links/observations from BOTH scopes. In Live mode
    the linked_sku_count and competitor_observation_count must count only
    user-scoped rows."""
    ent = ProductEntity(
        id="ent_shared", canonical_title="Shared Entity",
        is_manual=False, source_run_id="user:abc123",
    )
    db.add(ent)
    db.flush()

    # Two SKU links: one user, one demo.
    db.add(SKUProductLink(id="skl_user", sku="user-sku", entity_id=ent.id,
                          source_run_id="user:abc123"))
    db.add(SKUProductLink(id="skl_demo", sku="demo-sku", entity_id=ent.id,
                          source_run_id=DEMO_MEMORIAL_DAY))

    # One competitor product, two observations (one per scope).
    cp = CompetitorProduct(
        id="cp_x", source_id="whole_foods_demo", external_id="wf_x",
        stable_key="whole_foods_demo:wf_x", title="Shared Entity",
        price=9.0, currency="USD", availability="in_stock", raw_attributes={},
    )
    db.add(cp)
    db.flush()
    db.add(CompetitorProductEntity(id="cpe_x", competitor_product_id=cp.id,
                                   entity_id=ent.id, match_score=1.0))
    db.add(CompetitorPriceObservation(
        id="obs_user", competitor_product_id=cp.id, entity_id=ent.id,
        price=9.0, currency="USD", observed_at=utcnow(), source_run_id="user:abc123",
    ))
    db.add(CompetitorPriceObservation(
        id="obs_demo", competitor_product_id=cp.id, entity_id=ent.id,
        price=9.5, currency="USD", observed_at=utcnow(), source_run_id=DEMO_MEMORIAL_DAY,
    ))
    db.commit()

    client = TestClient(app)
    live = client.get("/api/v1/product-graph/entities?scope=live&limit=100").json()
    ent_live = next(e for e in live["entities"] if e["id"] == "ent_shared")
    assert ent_live["linked_sku_count"] == 1
    assert ent_live["competitor_observation_count"] == 1

    all_ = client.get("/api/v1/product-graph/entities?limit=100").json()
    ent_all = next(e for e in all_["entities"] if e["id"] == "ent_shared")
    assert ent_all["linked_sku_count"] == 2
    assert ent_all["competitor_observation_count"] == 2


# ──────────────────────────────────────────────────────────────────────
# auto_enrich_for_actions — every created row carries the scope tag
# ──────────────────────────────────────────────────────────────────────
def test_auto_enrich_stamps_source_run_id_on_all_rows(db):
    """The pathway that fires on every scenario execution must stamp the
    scope tag on entity, link, competitor observation, cost, and history —
    not leave them NULL (which splits a scenario across the boundary)."""
    from sqlalchemy import select
    from app.services.scenario_enrichment import auto_enrich_for_actions

    auto_enrich_for_actions(
        db,
        [{"sku": "enrich-sku", "product_name": "Enrich Product", "approved_price": 8.0}],
        ["Store-A"],
        zone_id="Zone-1",
        source_run_id="user:enrich-test",
    )

    link = db.scalar(select(SKUProductLink).where(SKUProductLink.sku == "enrich-sku"))
    assert link is not None and link.source_run_id == "user:enrich-test"

    entity = db.scalar(select(ProductEntity).where(ProductEntity.id == link.entity_id))
    assert entity is not None and entity.source_run_id == "user:enrich-test"

    cost = db.scalar(select(ProductCost).where(ProductCost.sku == "enrich-sku"))
    assert cost is not None and cost.source_run_id == "user:enrich-test"

    obs = list(db.scalars(
        select(CompetitorPriceObservation).where(CompetitorPriceObservation.entity_id == entity.id)
    ))
    assert obs and all(o.source_run_id == "user:enrich-test" for o in obs)

    sales = list(db.scalars(
        select(HistoricalSale).where(HistoricalSale.sku == "enrich-sku")
    ))
    assert sales and all(s.source_run_id == "user:enrich-test" for s in sales)


def test_auto_enrich_defaults_to_user_scope_sentinel_when_omitted(db):
    """Pre-execution enrichment (no scope yet) must still be non-NULL so the
    rows don't straddle the Live/Demo boundary."""
    from sqlalchemy import select
    from app.services.scenario_enrichment import auto_enrich_for_actions

    auto_enrich_for_actions(
        db,
        [{"sku": "anon-enrich", "product_name": "Anon Product", "approved_price": 6.0}],
        ["Store-A"],
    )
    link = db.scalar(select(SKUProductLink).where(SKUProductLink.sku == "anon-enrich"))
    assert link is not None and link.source_run_id == "user:auto-enrich"
