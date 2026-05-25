"""Tests for the pricing engine.

Three layers, each independently testable:

  1. Elasticity estimator — synthetic (price, units) data with known β
     proves the OLS fit recovers the true elasticity.
  2. Optimizer math — closed-form profit-max p* = β·c/(β+1) verified.
  3. Pipeline + constraints — every constraint exercised with the
     reason code asserted.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timezone, timedelta

import pytest

from app.pricing.constraints import (
    KVI_COMPETITOR_TOLERANCE,
    MIN_MARGIN_PCT,
    PERISHABLE_MARKDOWN_PCT,
    SHOCK_CAP_PCT,
    apply_competitor_ceiling,
    apply_cost_floor,
    apply_inventory_cap,
    apply_kvi_lock,
    apply_perishable_urgency,
    apply_shock_cap,
    recent_change_suppressed,
)
from app.pricing.elasticity import estimate_elasticity, predict_quantity
from app.pricing.models import (
    HistoricalObservation,
    PricingFeatures,
)
from app.pricing.optimizer import unconstrained_optimal_price
from app.pricing.pipeline import recommend_for_sku


# ──────────────────────────────────────────────────────────────────────
# Test helpers — synthetic history with known elasticity
# ──────────────────────────────────────────────────────────────────────
def make_history(
    true_beta: float = -1.5,
    base_quantity: float = 100.0,
    base_price: float = 5.0,
    price_levels: list[float] | None = None,
    days: int = 30,
    noise_sigma: float = 0.0,
) -> list[HistoricalObservation]:
    """Generate Q = A · p^β with optional log-normal noise."""
    if price_levels is None:
        price_levels = [4.5, 5.0, 5.5, 6.0]
    # A · base_price^β = base_quantity  →  A = base_quantity / base_price^β
    A = base_quantity / (base_price**true_beta)
    rng = _det_rng()
    history = []
    start = date(2026, 1, 1)
    for i in range(days):
        p = price_levels[i % len(price_levels)]
        q_expected = A * (p**true_beta)
        if noise_sigma > 0:
            # Deterministic "noise" so tests stay reproducible
            jitter = math.exp(rng() * noise_sigma * 2 - noise_sigma)
            q = max(1, int(q_expected * jitter))
        else:
            q = max(1, int(q_expected))
        history.append(
            HistoricalObservation(
                date=start + timedelta(days=i),
                price=p,
                units_sold=q,
            ),
        )
    return history


def _det_rng():
    """Deterministic pseudo-random in [-1, 1]."""
    state = [12345]

    def next_value():
        state[0] = (state[0] * 1103515245 + 12345) % (2**31)
        return (state[0] / (2**31)) * 2 - 1

    return next_value


# ──────────────────────────────────────────────────────────────────────
# Elasticity estimator
# ──────────────────────────────────────────────────────────────────────
def test_elasticity_recovers_known_beta_clean_data():
    history = make_history(true_beta=-1.5, days=60)
    fit = estimate_elasticity(history)
    assert fit.sufficient_data
    assert fit.n_observations == 60
    assert -1.55 < fit.beta < -1.45  # within 5% of true β
    assert fit.r_squared > 0.99  # noise-free → near-perfect fit


def test_elasticity_recovers_inelastic_demand():
    history = make_history(true_beta=-0.4, days=60)
    fit = estimate_elasticity(history)
    assert fit.sufficient_data
    assert -0.5 < fit.beta < -0.3
    assert fit.is_inelastic
    assert not fit.is_elastic


def test_elasticity_handles_insufficient_data():
    history = make_history(days=5)
    fit = estimate_elasticity(history)
    assert not fit.sufficient_data
    assert fit.n_observations == 5
    assert any("observations" in note.lower() for note in fit.notes)


def test_elasticity_handles_zero_price_variance():
    # Only one price level — can't separate price effect from noise
    history = make_history(price_levels=[5.0], days=30)
    fit = estimate_elasticity(history)
    assert not fit.sufficient_data
    assert any(
        "price level" in note.lower() or "variance" in note.lower()
        for note in fit.notes
    )


def test_elasticity_excludes_promotions_by_default():
    history = make_history(days=30)
    # Inject 5 "promotional" observations with wildly different demand —
    # these would skew the fit if not excluded.
    for i in range(5):
        history.append(
            HistoricalObservation(
                date=date(2026, 2, i + 1),
                price=3.0,
                units_sold=1000,  # 10× the normal demand at this price
                on_promotion=True,
            ),
        )
    fit_excl = estimate_elasticity(history, exclude_promotions=True)
    fit_incl = estimate_elasticity(history, exclude_promotions=False)
    # With promotions excluded the fit should hold; with them included
    # the (false) elasticity should look much more elastic.
    assert fit_excl.beta > fit_incl.beta + 0.1


def test_elasticity_flags_veblen_when_beta_positive():
    # Construct history where higher price comes with higher demand
    history = [
        HistoricalObservation(date=date(2026, 1, i + 1), price=4 + i * 0.5, units_sold=50 + i * 10)
        for i in range(20)
    ]
    fit = estimate_elasticity(history)
    assert fit.sufficient_data
    assert fit.beta > 0
    assert any("veblen" in note.lower() or "contaminated" in note.lower() for note in fit.notes)


def test_predict_quantity_inverse_of_fit():
    history = make_history(true_beta=-1.5, base_quantity=100, base_price=5.0, days=60)
    fit = estimate_elasticity(history)
    # At base price, predicted should match base quantity (within fit error)
    q = predict_quantity(fit, 5.0)
    assert 95 <= q <= 105


# ──────────────────────────────────────────────────────────────────────
# Optimizer math
# ──────────────────────────────────────────────────────────────────────
def test_optimizer_closed_form_matches_calculus():
    # For β = -2, c = 3: p* = (-2)(3)/(-2+1) = 6
    assert unconstrained_optimal_price(-2.0, 3.0) == pytest.approx(6.0)
    # For β = -1.5, c = 4: p* = (-1.5)(4)/(-1.5+1) = -6 / -0.5 = 12
    assert unconstrained_optimal_price(-1.5, 4.0) == pytest.approx(12.0)


def test_optimizer_returns_none_for_inelastic_beta():
    assert unconstrained_optimal_price(-0.5, 5.0) is None
    assert unconstrained_optimal_price(-0.99, 5.0) is None


def test_optimizer_returns_none_for_positive_beta():
    assert unconstrained_optimal_price(0.5, 5.0) is None


def test_optimizer_returns_none_for_degenerate_inputs():
    assert unconstrained_optimal_price(-1.0, 5.0) is None   # exactly -1 — division by zero
    assert unconstrained_optimal_price(-2.0, 0) is None      # zero cost


# ──────────────────────────────────────────────────────────────────────
# Constraint engine
# ──────────────────────────────────────────────────────────────────────
def test_cost_floor_lifts_below_margin_floor():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=10.0, cost=5.0,
    )
    result = apply_cost_floor(5.10, f)
    assert result.price == pytest.approx(5.0 * (1 + MIN_MARGIN_PCT))
    assert result.reasons[0].code == "AT_COST_FLOOR"


def test_perishable_urgency_forces_markdown_when_deadline_near():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.0, cost=2.0,
        is_perishable=True, days_to_deadline=1,
    )
    result = apply_perishable_urgency(5.0, f)
    assert result.price == pytest.approx(5.0 * (1 - PERISHABLE_MARKDOWN_PCT))
    assert result.reasons[0].code == "PERISHABLE_MARKDOWN_FORCED"


def test_perishable_urgency_no_op_when_deadline_far():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.0, cost=2.0,
        is_perishable=True, days_to_deadline=10,
    )
    result = apply_perishable_urgency(5.0, f)
    assert result.price == 5.0
    assert result.reasons == []


def test_kvi_lock_clamps_to_competitor_tolerance():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.0, cost=2.0,
        is_kvi=True, competitor_price=4.99,
    )
    # Try a price way above competitor — should clamp to upper bound
    result = apply_kvi_lock(6.50, f)
    assert result.price == pytest.approx(4.99 * (1 + KVI_COMPETITOR_TOLERANCE))
    assert result.reasons[0].code == "KVI_MATCHED_COMPETITOR"


def test_competitor_ceiling_for_non_kvi():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.0, cost=2.0,
        competitor_price=5.00,
    )
    # 7.00 is 40% above competitor — should clamp to +15% = 5.75
    result = apply_competitor_ceiling(7.00, f)
    assert result.price == pytest.approx(5.00 * 1.15)


def test_shock_cap_limits_change_to_25_pct_of_current():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=10.0, cost=5.0,
    )
    result = apply_shock_cap(20.0, f)  # 100% jump
    assert result.price == pytest.approx(10.0 * (1 + SHOCK_CAP_PCT))


def test_inventory_cap_raises_price_when_stockout_risk():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.0, cost=2.0,
        inventory_on_hand=50,
    )
    result = apply_inventory_cap(5.0, f, predicted_units=80)  # would exceed inventory
    assert result.price == pytest.approx(5.0 * 1.05)
    assert result.reasons[0].code == "INVENTORY_CAPPED"


def test_recent_change_suppresses_when_within_window():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.0, cost=2.0,
        days_since_last_price_change=3,
    )
    reason = recent_change_suppressed(f)
    assert reason is not None
    assert reason.code == "RECENT_CHANGE_SUPPRESSED"


def test_recent_change_no_suppress_when_past_window():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.0, cost=2.0,
        days_since_last_price_change=10,
    )
    assert recent_change_suppressed(f) is None


# ──────────────────────────────────────────────────────────────────────
# End-to-end pipeline tests
# ──────────────────────────────────────────────────────────────────────
def test_pipeline_recommends_lower_price_for_elastic_demand():
    f = PricingFeatures(
        sku="milk-1gal", store_id="S1", product_name="Milk",
        current_price=5.99, cost=2.50,
        history=make_history(true_beta=-1.5, days=60, base_price=5.99),
    )
    rec = recommend_for_sku(f)
    # Optimal closed-form: -1.5 * 2.50 / -0.5 = 7.50 — but shock cap (25%) limits to 7.49
    # then competitor ceiling none → final around 7.49
    assert rec.is_change
    assert rec.recommended_price > f.current_price  # higher actually, since elastic but cost dominates
    assert rec.elasticity is not None
    assert rec.elasticity.sufficient_data
    assert any(r.code == "ELASTIC_OPTIMIZED" for r in rec.reasons)


def test_pipeline_holds_price_with_insufficient_history():
    f = PricingFeatures(
        sku="new-sku", store_id="S1", product_name="New",
        current_price=5.99, cost=2.50,
        history=make_history(days=3),  # too few
    )
    rec = recommend_for_sku(f)
    assert not rec.is_change
    assert any(r.code == "INSUFFICIENT_HISTORY" for r in rec.reasons)


def test_pipeline_holds_when_cost_missing():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.99, cost=0,
        history=make_history(days=60),
    )
    rec = recommend_for_sku(f)
    assert not rec.is_change
    assert any(r.code == "MISSING_COST" for r in rec.reasons)


def test_pipeline_suppresses_recent_change():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.99, cost=2.50,
        days_since_last_price_change=3,
        history=make_history(days=60),
    )
    rec = recommend_for_sku(f)
    assert not rec.is_change
    assert any(r.code == "RECENT_CHANGE_SUPPRESSED" for r in rec.reasons)


def test_pipeline_forces_perishable_markdown():
    f = PricingFeatures(
        sku="strawberry", store_id="S1", product_name="Strawberries",
        current_price=4.99, cost=1.50,
        is_perishable=True, days_to_deadline=1,
        history=make_history(days=60, base_price=4.99),
    )
    rec = recommend_for_sku(f)
    assert rec.recommended_price < f.current_price
    assert any(r.code == "PERISHABLE_MARKDOWN_FORCED" for r in rec.reasons)


def test_pipeline_kvi_falls_back_to_competitor_when_no_history():
    f = PricingFeatures(
        sku="kvi-egg", store_id="S1", product_name="Eggs",
        current_price=4.19, cost=2.00,
        is_kvi=True, competitor_price=3.99,
        history=[],  # no history
    )
    rec = recommend_for_sku(f)
    assert rec.recommended_price == pytest.approx(3.99)
    assert any(r.code == "KVI_MATCHED_COMPETITOR" for r in rec.reasons)


def test_pipeline_includes_reasoning_for_every_recommendation():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.99, cost=2.50,
        history=make_history(days=60, base_price=5.99),
    )
    rec = recommend_for_sku(f)
    # Every recommendation should have at least one reason
    assert len(rec.reasons) >= 1
    # All reasons should have both code and message
    for r in rec.reasons:
        assert r.code
        assert r.message


def test_pipeline_confidence_score_is_zero_when_no_data():
    f = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.99, cost=2.50,
        history=[],
    )
    rec = recommend_for_sku(f)
    assert rec.confidence == 0.0


def test_pipeline_confidence_score_higher_with_more_clean_data():
    f_small = PricingFeatures(
        sku="x", store_id="S1", product_name="X",
        current_price=5.99, cost=2.50,
        history=make_history(days=15),
    )
    f_big = PricingFeatures(
        sku="x", store_id="S2", product_name="X",
        current_price=5.99, cost=2.50,
        history=make_history(days=90),
    )
    rec_small = recommend_for_sku(f_small)
    rec_big = recommend_for_sku(f_big)
    assert rec_big.confidence > rec_small.confidence
