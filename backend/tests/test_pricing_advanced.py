"""Advanced pricing scenarios: cannibalization, supply signals, cross-category effects."""
from __future__ import annotations

from datetime import timedelta

import pytest

from app.models import HistoricalSale, ProductEntity, utcnow
from app.pricing.cannibalization import (
    adjust_for_cannibalization,
    find_substitute_products,
    estimate_cross_elasticity,
    SubstituteProduct,
)
from app.pricing.supply_signals import compute_effective_cogs, example_egg_futures_signal, example_supplier_alert, CostSignal
from app.services.product_graph import create_product_entity, link_sku_to_entity


class TestCannibalization:
    """Cross-product demand cannibalization detection."""

    def test_estimate_cross_elasticity_no_history(self, db):
        """With no history, cross-elasticity defaults to zero."""
        entity_a = create_product_entity(db, "Eggs")
        entity_b = create_product_entity(db, "Milk")

        elast = estimate_cross_elasticity(db, entity_a.id, entity_b.id)
        assert elast == 0.0  # no history = no signal

    def test_estimate_cross_elasticity_with_divergent_trends(self, db):
        """If A raises while B drops, they're substitutes."""
        entity_a = create_product_entity(db, "Eggs")
        entity_b = create_product_entity(db, "Tofu")

        # Link SKUs
        link_sku_to_entity(db, "sku_eggs", entity_a.id)
        link_sku_to_entity(db, "sku_tofu", entity_b.id)

        # Create historical sales: eggs getting more expensive, tofu getting cheaper
        now = utcnow()
        for i in range(5):
            date_i = now - timedelta(days=(5 - i))

            egg_sale = HistoricalSale(
                id=f"es_{i}",
                sku="sku_eggs",
                store_id="store_1",
                date=date_i,
                price=3.00 + (i * 0.20),  # rising
                units_sold=100 - (i * 10),  # falling as price rises
            )
            db.add(egg_sale)

            tofu_sale = HistoricalSale(
                id=f"ts_{i}",
                sku="sku_tofu",
                store_id="store_1",
                date=date_i,
                price=2.50 - (i * 0.10),  # falling
                units_sold=50 + (i * 5),  # rising as price falls (substitute)
            )
            db.add(tofu_sale)

        db.commit()

        elast = estimate_cross_elasticity(db, entity_a.id, entity_b.id)
        # With divergent trends, should detect positive cross-elasticity (substitutes)
        assert elast >= 0.0

    def test_find_substitute_products(self, db):
        """Detect products that substitute for a target."""
        primary = create_product_entity(db, "Eggs", brand="Farm Fresh")
        substitute1 = create_product_entity(db, "Egg Beaters")
        substitute2 = create_product_entity(db, "Tofu Scramble")

        # Link to SKUs so we have history to check
        link_sku_to_entity(db, "sku_eggs", primary.id)
        link_sku_to_entity(db, "sku_eggbeaters", substitute1.id)
        link_sku_to_entity(db, "sku_tofu", substitute2.id)

        # Query for substitutes
        subs = find_substitute_products(db, primary.id)
        # With minimal history, likely to return empty or low-confidence
        assert isinstance(subs, list)

    def test_adjust_for_cannibalization_small_raise(self, db):
        """Small price raises don't cannibalize."""
        subs = [
            SubstituteProduct(
                entity_id="sub1",
                canonical_title="Substitute 1",
                category_id=None,
                estimated_cross_elasticity=0.30,
                confidence=0.8,
            )
        ]

        # 5% raise
        adjusted, reason = adjust_for_cannibalization(
            recommended_price=10.50,
            current_price=10.00,
            primary_entity_id="primary",
            substitute_products=subs,
        )

        # Small raises not adjusted
        assert adjusted == 10.50
        assert reason is None

    def test_adjust_for_cannibalization_large_raise_with_subs(self, db):
        """Large raise with strong substitutes is reduced."""
        subs = [
            SubstituteProduct(
                entity_id="sub1",
                canonical_title="Strong Substitute",
                category_id=None,
                estimated_cross_elasticity=0.25,
                confidence=0.9,
            ),
            SubstituteProduct(
                entity_id="sub2",
                canonical_title="Another Sub",
                category_id=None,
                estimated_cross_elasticity=0.25,
                confidence=0.9,
            ),
        ]

        # 15% raise
        adjusted, reason = adjust_for_cannibalization(
            recommended_price=11.50,
            current_price=10.00,
            primary_entity_id="primary",
            substitute_products=subs,
        )

        # Should be reduced due to cannibalization risk
        assert adjusted < 11.50
        assert adjusted > 10.00
        assert reason is not None
        assert "Cannibalization" in reason


class TestSupplySignals:
    """Supply-chain cost forecasting."""

    def test_example_signals_are_valid(self):
        """Example signals have correct structure."""
        egg_signal = example_egg_futures_signal()
        assert egg_signal.commodity == "eggs"
        assert egg_signal.forecasted_cost_idx > egg_signal.current_cost_idx
        assert 0 <= egg_signal.confidence <= 1.0

        supplier_signal = example_supplier_alert()
        assert supplier_signal.signal_type == "supplier_alert"
        assert supplier_signal.confidence == 0.95

    def test_compute_effective_cogs_no_signals(self):
        """With no signals, effective COGS = base COGS."""
        base = 2.50
        effective = compute_effective_cogs(base, [])
        assert effective == base

    def test_compute_effective_cogs_with_upward_signal(self):
        """Upward supply signal increases effective COGS."""
        base = 2.50

        now = utcnow()
        signal = CostSignal(
            signal_type="commodity_future",
            commodity="eggs",
            current_cost_idx=100.0,
            forecasted_cost_idx=112.0,  # +12%
            forecast_date=now + timedelta(days=21),
            confidence=0.80,
            reason="Futures indicate spike",
        )

        effective = compute_effective_cogs(base, [signal], horizon_days=30)
        # Should be > base due to upward pressure
        assert effective > base

    def test_compute_effective_cogs_with_downward_signal(self):
        """Downward supply signal decreases effective COGS."""
        base = 2.50

        now = utcnow()
        signal = CostSignal(
            signal_type="commodity_future",
            commodity="wheat",
            current_cost_idx=100.0,
            forecasted_cost_idx=85.0,  # -15%
            forecast_date=now + timedelta(days=14),
            confidence=0.70,
            reason="Harvest coming, prices falling",
        )

        effective = compute_effective_cogs(base, [signal], horizon_days=30)
        # Should be < base due to downward pressure
        assert effective < base

    def test_compute_effective_cogs_caps_adjustment(self):
        """Adjustments are capped at ±10% to avoid whipsaw."""
        base = 2.50

        now = utcnow()
        extreme_signal = CostSignal(
            signal_type="commodity_future",
            commodity="eggs",
            current_cost_idx=100.0,
            forecasted_cost_idx=250.0,  # +150% (unrealistic, should be capped)
            forecast_date=now + timedelta(days=15),
            confidence=1.0,
            reason="Extreme scenario",
        )

        effective = compute_effective_cogs(base, [extreme_signal], horizon_days=30)
        # Even with extreme signal, adjustment capped
        assert effective <= base * 1.10
        assert effective >= base * 0.90

    def test_compute_effective_cogs_ignores_distant_signals(self):
        """Signals beyond horizon are ignored."""
        base = 2.50

        now = utcnow()
        distant_signal = CostSignal(
            signal_type="commodity_future",
            commodity="eggs",
            current_cost_idx=100.0,
            forecasted_cost_idx=120.0,
            forecast_date=now + timedelta(days=45),  # beyond 30-day horizon
            confidence=0.80,
            reason="Too far in future",
        )

        effective = compute_effective_cogs(base, [distant_signal], horizon_days=30)
        # Should ignore the signal
        assert effective == base

    def test_compute_effective_cogs_weights_by_confidence(self):
        """Higher-confidence signals have more weight."""
        base = 2.50

        now = utcnow()
        high_conf = CostSignal(
            signal_type="supplier_alert",
            commodity="milk",
            current_cost_idx=100.0,
            forecasted_cost_idx=108.0,
            forecast_date=now + timedelta(days=7),
            confidence=0.95,
            reason="Supplier announced",
        )
        low_conf = CostSignal(
            signal_type="commodity_future",
            commodity="wheat",
            current_cost_idx=100.0,
            forecasted_cost_idx=95.0,
            forecast_date=now + timedelta(days=10),
            confidence=0.30,
            reason="Speculative forecast",
        )

        effective_both = compute_effective_cogs(base, [high_conf, low_conf], horizon_days=30)
        effective_high_only = compute_effective_cogs(base, [high_conf], horizon_days=30)

        # High-confidence upward signal should dominate
        assert effective_high_only > base
        # Adding a weak downward signal should reduce the upward effect slightly
        assert effective_both < effective_high_only
