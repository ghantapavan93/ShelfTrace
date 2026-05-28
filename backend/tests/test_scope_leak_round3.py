"""Round-3 scope-leak regression tests.

Covers the gaps a wider (whole-codebase) audit found after the first two
rounds had hardened the list/detail endpoints:

  • the /sku/* read-endpoint family (suggest, history, what-if-fit) that had
    no ?scope= param at all
  • /pricing/costs and /pricing/signals list endpoints
  • product-graph entity detail + substitutes + per-SKU competitor prices
  • the pricing engine itself, which used to apply a demo ExternalSignal to
    user-scoped recommendations (the "heavy" gap) — now isolated by
    same_scope_side()
"""
from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    Environment,
    ExternalSignal,
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
from app.scope import DEMO_MEMORIAL_DAY, is_demo, same_scope_side


# ── builders ───────────────────────────────────────────────────────────
def _batch(db, *, suffix, srid):
    b = PriceBatch(
        id=f"b_{suffix}", external_id=f"ext_{suffix}", idempotency_key=f"i_{suffix}",
        name=suffix, zone="Z", approved_by="t", total_store_count=1,
        run_mode=RunMode.LIVE_ROLLOUT, environment=Environment.SIMULATED_PRODUCTION,
        source_run_id=srid,
    )
    db.add(b)
    db.flush()
    return b


def _action(db, *, batch_id, sku, store, price, is_kvi=False):
    db.add(PriceAction(
        id=f"a_{sku}_{store}", batch_id=batch_id, sku=sku, store_id=store,
        product_name=f"P {sku}", approved_price=price, prior_price=price,
        reason="t", is_kvi=is_kvi,
    ))


def _rec(db, *, suffix, sku, store, srid, recommended=11.0):
    db.add(PricingRecommendation(
        id=f"r_{suffix}", sku=sku, store_id=store, product_name=f"P {sku}",
        current_price=10.0, recommended_price=recommended, source_run_id=srid,
        applied=False, superseded_by=None,
    ))


def _history(db, *, sku, store, srid, days=30):
    """Synthetic price-varying history so the engine can fit elasticity."""
    end = utcnow().replace(hour=12, minute=0, second=0, microsecond=0)
    levels = [4.5, 4.75, 5.0, 5.25, 5.5]
    A = 100 * (5.0 ** 1.4)  # base demand calibration for beta=-1.4
    for d in range(days):
        price = levels[d % len(levels)]
        units = max(1, int(A * (price ** -1.4)))
        db.add(HistoricalSale(
            id=f"h_{sku}_{store}_{d}", sku=sku, store_id=store,
            date=end - timedelta(days=days - d), price=price, units_sold=units,
            on_promotion=False, source_run_id=srid,
        ))


# ── scope.py predicate ─────────────────────────────────────────────────
def test_same_scope_side_predicate():
    assert is_demo("demo:memorial-day") is True
    assert is_demo("user:abc") is False
    assert is_demo(None) is False
    # same side
    assert same_scope_side("demo:x", "demo:y") is True
    assert same_scope_side("user:x", None) is True
    assert same_scope_side(None, "user:y") is True
    # opposite side
    assert same_scope_side("demo:x", "user:y") is False
    assert same_scope_side("demo:x", None) is False


# ── /sku/* read family ─────────────────────────────────────────────────
def test_sku_suggest_scope_excludes_demo(db):
    _rec(db, suffix="demo", sku="s1", store="A", srid=DEMO_MEMORIAL_DAY)
    db.commit()
    client = TestClient(app)
    live = client.get("/api/v1/pricing/sku/s1/suggest?scope=live").json()
    assert live["recommendation"] is None  # demo rec hidden in live
    demo = client.get("/api/v1/pricing/sku/s1/suggest?scope=demo").json()
    assert demo["recommendation"] is not None


def test_sku_history_scope_excludes_demo(db):
    _history(db, sku="s2", store="A", srid=DEMO_MEMORIAL_DAY, days=10)
    _history(db, sku="s2", store="B", srid="user:abc", days=10)
    db.commit()
    client = TestClient(app)
    live = client.get("/api/v1/pricing/sku/s2/history?scope=live").json()
    stores = {o["store_id"] for o in live["observations"]}
    assert stores == {"B"}  # only the user-scoped store's history


def test_costs_and_signals_scope(db):
    db.add(ProductCost(id="c_demo", sku="cd", cost=2.0, source_run_id=DEMO_MEMORIAL_DAY))
    db.add(ProductCost(id="c_user", sku="cu", cost=2.0, source_run_id="user:abc"))
    now = utcnow()
    db.add(ExternalSignal(
        id="sig_demo", name="Demo Boost", signal_type="holiday", multiplier=1.4,
        effective_from=now - timedelta(days=1), effective_until=now + timedelta(days=1),
        source_run_id=DEMO_MEMORIAL_DAY,
    ))
    db.commit()
    client = TestClient(app)

    costs_live = {c["sku"] for c in client.get("/api/v1/pricing/costs?scope=live").json()["costs"]}
    assert "cu" in costs_live and "cd" not in costs_live

    sig_live = client.get("/api/v1/pricing/signals?scope=live").json()["signals"]
    assert all(s["name"] != "Demo Boost" for s in sig_live)
    sig_demo = client.get("/api/v1/pricing/signals?scope=demo").json()["signals"]
    assert any(s["name"] == "Demo Boost" for s in sig_demo)


# ── product-graph entity detail + substitutes + competitor prices ──────
def test_entity_detail_scope_excludes_demo_children(db):
    ent = ProductEntity(id="e1", canonical_title="Shared", is_manual=False,
                        source_run_id="user:abc")
    db.add(ent)
    db.flush()
    db.add(SKUProductLink(id="l_u", sku="u-sku", entity_id="e1", source_run_id="user:abc"))
    db.add(SKUProductLink(id="l_d", sku="d-sku", entity_id="e1", source_run_id=DEMO_MEMORIAL_DAY))
    cp = CompetitorProduct(id="cp1", source_id="wf", external_id="x", stable_key="wf:x",
                           title="Shared", price=9.0, currency="USD",
                           availability="in_stock", raw_attributes={})
    db.add(cp)
    db.flush()
    db.add(CompetitorProductEntity(id="cpe1", competitor_product_id="cp1", entity_id="e1", match_score=1.0))
    db.add(CompetitorPriceObservation(id="o_u", competitor_product_id="cp1", entity_id="e1",
                                      price=9.0, currency="USD", observed_at=utcnow(),
                                      source_run_id="user:abc"))
    db.add(CompetitorPriceObservation(id="o_d", competitor_product_id="cp1", entity_id="e1",
                                      price=9.5, currency="USD", observed_at=utcnow(),
                                      source_run_id=DEMO_MEMORIAL_DAY))
    db.commit()

    client = TestClient(app)
    live = client.get("/api/v1/product-graph/entities/e1?scope=live").json()
    assert len(live["linked_skus"]) == 1
    assert len(live["competitor_observations"]) == 1
    all_ = client.get("/api/v1/product-graph/entities/e1").json()
    assert len(all_["linked_skus"]) == 2
    assert len(all_["competitor_observations"]) == 2


def test_competitor_prices_for_sku_scope(db):
    ent = ProductEntity(id="e2", canonical_title="Eggs", is_manual=False, source_run_id="user:abc")
    db.add(ent)
    db.flush()
    db.add(SKUProductLink(id="l2", sku="eggs", entity_id="e2", source_run_id="user:abc"))
    cp = CompetitorProduct(id="cp2", source_id="wf", external_id="y", stable_key="wf:y",
                           title="Eggs", price=4.0, currency="USD",
                           availability="in_stock", raw_attributes={})
    db.add(cp)
    db.flush()
    db.add(CompetitorPriceObservation(id="o2u", competitor_product_id="cp2", entity_id="e2",
                                      price=4.0, currency="USD", observed_at=utcnow(),
                                      source_run_id="user:abc"))
    db.add(CompetitorPriceObservation(id="o2d", competitor_product_id="cp2", entity_id="e2",
                                      price=4.9, currency="USD", observed_at=utcnow(),
                                      source_run_id=DEMO_MEMORIAL_DAY))
    db.commit()
    client = TestClient(app)
    live = client.get("/api/v1/product-graph/sku/eggs/competitor-prices?scope=live").json()
    assert len(live["observations"]) == 1
    assert live["observations"][0]["price"] == 4.0


# ── the heavy one: engine signal isolation ─────────────────────────────
def test_engine_demo_signal_does_not_affect_user_recs(db):
    """A demo-scoped ExternalSignal must not multiply a user rec's demand.

    Set up a user batch + action + history, plus a demo demand-boost signal.
    Run the engine. The user rec's reasons_json.demand_multiplier must be
    1.0 (signal skipped) and matched_signals empty.
    """
    from sqlalchemy import select
    from app.pricing.pipeline import run_pricing_engine

    ub = _batch(db, suffix="userrun", srid="user:run1")
    _action(db, batch_id=ub.id, sku="eng-sku", store="A", price=5.0)
    db.add(ProductCost(id="c_eng", sku="eng-sku", cost=3.0, source_run_id="user:run1"))
    _history(db, sku="eng-sku", store="A", srid="user:run1", days=30)

    now = utcnow()
    db.add(ExternalSignal(
        id="sig_big", name="Memorial Day grilling demand boost", signal_type="holiday",
        multiplier=1.4, effective_from=now - timedelta(days=2),
        effective_until=now + timedelta(days=2),
        category_pattern=None, sku_pattern=None, source_run_id=DEMO_MEMORIAL_DAY,
    ))
    db.commit()

    run_pricing_engine(db)

    rec = db.scalar(
        select(PricingRecommendation)
        .where(PricingRecommendation.sku == "eng-sku")
        .where(PricingRecommendation.store_id == "A")
        .where(PricingRecommendation.superseded_by.is_(None))
    )
    assert rec is not None, "engine should have produced a user rec"
    assert rec.source_run_id == "user:run1"
    # The demo signal must NOT have been applied.
    assert rec.reasons_json.get("demand_multiplier") == 1.0
    assert rec.reasons_json.get("matched_signals") == []


def test_engine_demo_signal_applies_to_demo_recs(db):
    """Symmetric check: the same demo signal DOES apply to a demo rec, so the
    isolation is a same-side filter, not a blanket suppression."""
    from sqlalchemy import select
    from app.pricing.pipeline import run_pricing_engine

    dbatch = _batch(db, suffix="demorun", srid=DEMO_MEMORIAL_DAY)
    _action(db, batch_id=dbatch.id, sku="demo-eng", store="A", price=5.0)
    db.add(ProductCost(id="c_deng", sku="demo-eng", cost=3.0, source_run_id=DEMO_MEMORIAL_DAY))
    _history(db, sku="demo-eng", store="A", srid=DEMO_MEMORIAL_DAY, days=30)

    now = utcnow()
    db.add(ExternalSignal(
        id="sig_big2", name="Memorial Day grilling demand boost", signal_type="holiday",
        multiplier=1.4, effective_from=now - timedelta(days=2),
        effective_until=now + timedelta(days=2),
        category_pattern=None, sku_pattern=None, source_run_id=DEMO_MEMORIAL_DAY,
    ))
    db.commit()

    run_pricing_engine(db)

    rec = db.scalar(
        select(PricingRecommendation)
        .where(PricingRecommendation.sku == "demo-eng")
        .where(PricingRecommendation.store_id == "A")
        .where(PricingRecommendation.superseded_by.is_(None))
    )
    assert rec is not None
    assert rec.reasons_json.get("demand_multiplier") == 1.4
    assert "Memorial Day grilling demand boost" in rec.reasons_json.get("matched_signals", [])
