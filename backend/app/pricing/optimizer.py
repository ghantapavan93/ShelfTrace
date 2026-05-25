"""Profit-maximising price under constant-elasticity demand.

Math
====
Given:
  Q(p) = A · p^β        (constant elasticity demand, fit from history)
  π(p) = (p - c) · Q(p)  (profit per unit time at price p)

For elastic demand (β < -1) there is an interior maximum at:
  p* = c · β / (β + 1)

Derivation:
  dπ/dp = Q + (p - c) · dQ/dp
        = A p^β · [1 + (p - c)/p · β]
        = A p^β · [1 + β - β c / p]
  Setting to zero and solving:
        β c / p = 1 + β
        p = β c / (1 + β)   (negative numerator and denominator, so positive)

For inelastic demand (-1 ≤ β < 0):
  π is monotonically increasing in p — the constrained optimum is the
  competitor ceiling (or some other business-imposed cap).

The closed-form is the unconstrained optimum. We then run it through
the constraint pipeline (cost floor, competitor ceiling, KVI rules,
perishable urgency) to get the final recommended price.
"""
from __future__ import annotations

from app.pricing.elasticity import predict_quantity
from app.pricing.models import ElasticityFit


def unconstrained_optimal_price(beta: float, cost: float) -> float | None:
    """p* = β·c / (β + 1). Returns None for inelastic or degenerate cases."""
    if beta >= 0 or beta == -1.0 or cost <= 0:
        return None
    p_star = (beta * cost) / (beta + 1)
    # Numerical guard — extreme β near -1 produces silly numbers
    if p_star <= 0 or p_star > 1e6:
        return None
    return p_star


def expected_units(fit: ElasticityFit, price: float) -> float:
    """Convenience wrapper — delegates to elasticity.predict_quantity."""
    return predict_quantity(fit, price)


def expected_revenue(fit: ElasticityFit, price: float) -> float:
    return expected_units(fit, price) * price


def expected_profit(fit: ElasticityFit, price: float, cost: float) -> float:
    if cost is None or cost < 0:
        return 0.0
    return expected_units(fit, price) * max(0.0, price - cost)


def clamp(value: float, low: float | None, high: float | None) -> float:
    if low is not None and value < low:
        return low
    if high is not None and value > high:
        return high
    return value
