"""Pricing-engine guard regressions from the deep backend audit.

Two real math gaps:

  1. The cost floor was applied FIRST in the constraint chain, but downward
     constraints that run after it (shock cap clamping toward a low current price,
     KVI lock / competitor ceiling toward a low competitor) could drag the final
     price back BELOW cost — with no re-floor. A loss-leader the optimizer wanted
     to RAISE could be recommended below cost. Now the floor is re-asserted as the
     final hard guard, EXCEPT for a perishable in its clear-out window (where a
     below-cost markdown to sell through before the deadline is intentional).

  2. is_statistically_significant treated a zero-standard-error (degenerate /
     perfect) fit as maximally significant, because the collapsed CI has
     beta_ci_low*beta_ci_high = beta² > 0. A zero-width interval is not evidence.
"""
from __future__ import annotations

from app.pricing.constraints import MIN_MARGIN_PCT
from app.pricing.models import ElasticityFit, PricingFeatures
from app.pricing.pipeline import recommend_for_sku
from tests.test_pricing import make_history


def test_recommendation_never_below_cost_after_downward_clamp():
    """An elastic item priced far below cost: the optimizer wants to RAISE it, but
    the 25% shock cap clips the rise back below cost. The recommendation must be
    re-floored to cost+margin — never returned below cost. (Audit P1.)"""
    f = PricingFeatures(
        sku="loss-leader",
        store_id="S1",
        product_name="Underpriced Item",
        current_price=1.00,
        cost=2.00,
        history=make_history(
            true_beta=-3.0, base_price=1.0, price_levels=[0.9, 1.0, 1.1, 1.2], days=60
        ),
    )
    rec = recommend_for_sku(f)
    floor = 2.00 * (1 + MIN_MARGIN_PCT)  # 2.10
    # Core guarantee: never below cost (and specifically not below cost+margin).
    assert rec.recommended_price >= floor - 1e-6, rec.recommended_price
    # The re-floor actually fired (a downward constraint had clipped below cost).
    assert "cost_floor_reasserted" in rec.applied_constraints


def test_perishable_clearout_markdown_is_not_re_floored():
    """A perishable within its clear-out window (≤2 days to deadline) is marked
    down below cost on purpose to sell through. The re-floor must SKIP it, so the
    below-cost clearance survives. (Guards the perishable exemption.)"""
    f = PricingFeatures(
        sku="berries",
        store_id="S1",
        product_name="Strawberries",
        current_price=3.00,
        cost=3.00,
        is_perishable=True,
        days_to_deadline=1,
        history=make_history(
            true_beta=-2.0, base_price=3.0, price_levels=[2.7, 3.0, 3.3, 3.6], days=60
        ),
    )
    rec = recommend_for_sku(f)
    # The clearance markdown is allowed to stay below cost; the re-floor did NOT fire.
    assert rec.recommended_price < f.cost, rec.recommended_price
    assert "cost_floor_reasserted" not in rec.applied_constraints
    assert "perishable_urgency" in rec.applied_constraints


def test_significance_requires_positive_standard_error():
    """A degenerate/perfect fit (zero standard error) collapses the CI onto the
    point estimate, making beta_ci_low*beta_ci_high = beta² > 0. That must NOT read
    as statistically significant — a zero-width interval is not evidence. (Audit P1.)"""
    degenerate = ElasticityFit(
        beta=-2.0,
        intercept=1.0,
        r_squared=1.0,
        n_observations=10,
        sufficient_data=True,
        beta_se=0.0,
        beta_ci_low=-2.0,
        beta_ci_high=-2.0,
    )
    assert degenerate.is_statistically_significant is False

    # A genuine fit with a positive-width, same-sign CI IS significant.
    real = ElasticityFit(
        beta=-2.0,
        intercept=1.0,
        r_squared=0.9,
        n_observations=10,
        sufficient_data=True,
        beta_se=0.3,
        beta_ci_low=-2.6,
        beta_ci_high=-1.4,
    )
    assert real.is_statistically_significant is True
