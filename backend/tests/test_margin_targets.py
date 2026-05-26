"""Margin-target endpoint — policy-bucket margin rollup vs target.

Classifies every latest PriceAction into one of three policy buckets
(kvi/perishable/standard) and reports weighted-average margin against
each bucket's target. Powers the /pricing page's policy lens.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    Environment,
    PriceAction,
    PriceBatch,
    ProductCost,
    RunMode,
)


def _make_batch(db, *, suffix: str) -> PriceBatch:
    batch = PriceBatch(
        id=f"batch_{suffix}",
        external_id=f"ext_{suffix}",
        idempotency_key=f"idem_{suffix}",
        name=f"Margin test batch {suffix}",
        zone="Test Zone",
        approved_by="test",
        total_store_count=1,
        run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION,
    )
    db.add(batch)
    db.flush()
    return batch


def _seed_action(db, *, batch_id, sku, store_id, price, cost,
                 is_kvi=False, is_perishable=False):
    db.add(PriceAction(
        id=f"act_{sku}_{store_id}",
        batch_id=batch_id,
        sku=sku,
        store_id=store_id,
        product_name=f"Product {sku}",
        approved_price=price,
        prior_price=price,
        reason="test",
        is_kvi=is_kvi,
        is_perishable=is_perishable,
    ))
    db.add(ProductCost(id=f"cost_{sku}", sku=sku, cost=cost))


def test_margin_targets_empty_when_no_actions(db):
    """Empty payload is well-formed: 3 buckets, all no_data."""
    client = TestClient(app)
    res = client.get("/api/v1/pricing/margin-targets")
    assert res.status_code == 200
    body = res.json()
    assert len(body["categories"]) == 3
    assert all(c["status"] == "no_data" for c in body["categories"])
    assert body["portfolio"]["current_pct"] is None


def test_margin_targets_classifies_kvi_perishable_standard(db):
    """Actions land in the right policy bucket based on their flags."""
    batch = _make_batch(db, suffix="classify")
    _seed_action(db, batch_id=batch.id, sku="kvi-1", store_id="A",
                 price=5.00, cost=4.50, is_kvi=True)         # 10% margin → at target
    _seed_action(db, batch_id=batch.id, sku="per-1", store_id="A",
                 price=4.00, cost=3.00, is_perishable=True)  # 25% margin → at target
    _seed_action(db, batch_id=batch.id, sku="std-1", store_id="A",
                 price=10.00, cost=7.00)                     # 30% margin → at target
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/pricing/margin-targets")
    body = res.json()
    by_policy = {c["policy"]: c for c in body["categories"]}

    assert by_policy["kvi"]["n_skus"] == 1
    assert by_policy["perishable"]["n_skus"] == 1
    assert by_policy["standard"]["n_skus"] == 1

    # Each bucket is on target
    for policy in ("kvi", "perishable", "standard"):
        assert by_policy[policy]["status"] == "at", (
            f"{policy}: gap={by_policy[policy]['gap_pct']}"
        )


def test_margin_targets_flags_below_band(db):
    """A KVI bucket priced too tight against cost lands in 'below'."""
    batch = _make_batch(db, suffix="below")
    # 2% margin vs 10% target → 8pp gap, well past the 3pp "near" band
    _seed_action(db, batch_id=batch.id, sku="kvi-1", store_id="A",
                 price=5.00, cost=4.90, is_kvi=True)
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/pricing/margin-targets")
    body = res.json()
    kvi = next(c for c in body["categories"] if c["policy"] == "kvi")
    assert kvi["status"] == "below"
    assert kvi["gap_pct"] is not None
    assert kvi["gap_pct"] < -0.03  # at least 3pp under


def test_margin_targets_skus_without_cost_count_but_dont_distort_margin(db):
    """A SKU without a cost row counts in n_skus but is excluded from margin math."""
    batch = _make_batch(db, suffix="nocost")
    _seed_action(db, batch_id=batch.id, sku="with-cost", store_id="A",
                 price=10.00, cost=7.00)
    # action with no ProductCost row
    db.add(PriceAction(
        id="act_no_cost",
        batch_id=batch.id,
        sku="no-cost", store_id="A",
        product_name="No Cost Item",
        approved_price=10.00,
        prior_price=10.00,
        reason="missing cost",
    ))
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/pricing/margin-targets")
    body = res.json()
    std = next(c for c in body["categories"] if c["policy"] == "standard")
    assert std["n_skus"] == 2
    assert std["n_with_cost"] == 1
    # Margin still 30% from the only SKU with cost data
    assert abs(std["current_pct"] - 0.30) < 0.001


def test_margin_targets_portfolio_blends_buckets(db):
    """Portfolio rollup is the revenue-weighted blend of per-bucket margins."""
    batch = _make_batch(db, suffix="portfolio")
    _seed_action(db, batch_id=batch.id, sku="kvi-1", store_id="A",
                 price=5.00, cost=4.50, is_kvi=True)         # 10%
    _seed_action(db, batch_id=batch.id, sku="std-1", store_id="A",
                 price=10.00, cost=7.00)                     # 30%
    db.commit()

    client = TestClient(app)
    res = client.get("/api/v1/pricing/margin-targets")
    body = res.json()
    pf = body["portfolio"]
    assert pf["current_pct"] is not None
    # KVI ($5 weight) + Standard ($10 weight) → blend: (0.10*5 + 0.30*10) / 15 ≈ 0.233
    assert abs(pf["current_pct"] - (0.10 * 5 + 0.30 * 10) / 15) < 0.005
    assert pf["n_skus"] == 2


def test_margin_targets_response_shape(db):
    """Response contract: categories, portfolio, bands all present and well-typed."""
    client = TestClient(app)
    res = client.get("/api/v1/pricing/margin-targets")
    assert res.status_code == 200
    body = res.json()
    assert "categories" in body and isinstance(body["categories"], list)
    assert "portfolio" in body and isinstance(body["portfolio"], dict)
    assert "bands" in body
    assert body["bands"]["at_pp"] > 0
    assert body["bands"]["near_pp"] > body["bands"]["at_pp"]
    for c in body["categories"]:
        for k in ("policy", "label", "target_pct", "current_pct",
                  "gap_pct", "n_skus", "n_with_cost", "revenue_estimate", "status"):
            assert k in c
