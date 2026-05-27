"""Auto-seeding of ProductCost when a scenario is created.

Closes the data-coverage gap surfaced by db_audit: bulk-imported CSVs
left their SKUs without a ProductCost, so the margin-target dashboard
showed a misleadingly partial rollup. create_config now upserts a cost
at 60% of approved_price (40% gross margin baseline) per action.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import ProductCost
from app.schemas import ScenarioActionIn, ScenarioIn
from app.services import scenarios


def _make_payload(*, sku: str, approved_price: float, name: str = "Test Scenario"):
    return ScenarioIn(
        name=name,
        run_mode="live_rollout",
        environment="simulated_production",
        zone_name="Test Zone",
        store_ids=["S1"],
        canary_store_ids=["S1"],
        actions=[
            ScenarioActionIn(
                sku=sku,
                product_name=f"Product {sku}",
                previous_price=approved_price + 0.50,
                approved_price=approved_price,
                reason="cost-seed test",
            )
        ],
        behaviors=[],
    )


def test_create_config_seeds_cost_at_default_ratio(db):
    """A newly-imported SKU should get a ProductCost = approved_price * 0.60."""
    payload = _make_payload(sku="seedme-1", approved_price=10.00)
    scenarios.create_config(db, payload)

    cost = db.scalar(select(ProductCost).where(ProductCost.sku == "seedme-1"))
    assert cost is not None, "expected ProductCost row to be created"
    assert cost.cost == pytest.approx(6.00, abs=0.005), (
        f"expected $6.00 (60% of $10.00), got ${cost.cost}"
    )


def test_create_config_idempotent_when_cost_exists(db):
    """If a ProductCost already exists for the SKU, leave it alone."""
    db.add(ProductCost(id="cost_existing", sku="existing-sku", cost=4.20))
    db.commit()

    payload = _make_payload(sku="existing-sku", approved_price=10.00)
    scenarios.create_config(db, payload)

    costs = list(
        db.scalars(select(ProductCost).where(ProductCost.sku == "existing-sku"))
    )
    assert len(costs) == 1, "should not duplicate cost rows"
    assert costs[0].cost == pytest.approx(4.20), "should not overwrite existing cost"


def test_create_config_skips_zero_priced_actions(db):
    """Defensive: a 0-priced action should not produce a 0-cost row."""
    # Build payload manually since ScenarioIn validates approved_price > 0.
    # We exercise the helper directly to mirror what the validator would
    # have stopped — but the helper itself should still be defensive.
    from app.services.scenarios import _ensure_cost_for_action

    _ensure_cost_for_action(db, "zero-sku", 0.0)
    db.flush()

    cost = db.scalar(select(ProductCost).where(ProductCost.sku == "zero-sku"))
    assert cost is None, "should not seed cost for 0-price action"


def test_create_config_handles_multiple_actions_in_one_payload(db):
    """All SKUs in a single scenario get their costs seeded together."""
    payload = ScenarioIn(
        name="Multi-action import",
        run_mode="live_rollout",
        environment="simulated_production",
        zone_name="Test Zone",
        store_ids=["S1"],
        canary_store_ids=["S1"],
        actions=[
            ScenarioActionIn(sku="m1", product_name="P1", previous_price=5.50, approved_price=5.00, reason="x"),
            ScenarioActionIn(sku="m2", product_name="P2", previous_price=9.99, approved_price=8.99, reason="x"),
            ScenarioActionIn(sku="m3", product_name="P3", previous_price=2.49, approved_price=1.99, reason="x"),
        ],
        behaviors=[],
    )
    scenarios.create_config(db, payload)

    costs = {
        c.sku: c.cost
        for c in db.scalars(
            select(ProductCost).where(ProductCost.sku.in_(["m1", "m2", "m3"]))
        )
    }
    assert costs["m1"] == pytest.approx(3.00, abs=0.005)
    assert costs["m2"] == pytest.approx(5.39, abs=0.005)
    assert costs["m3"] == pytest.approx(1.19, abs=0.005)
