"""Price elasticity estimation via log-log OLS regression.

The economic model: Q = A · P^β · ε
  Take logs:        log Q = log A + β log P + log ε
  This is linear in (log P, log Q). OLS gives a closed-form β.

β is the price elasticity of demand:
  • β = -1.5 means a 1% price increase → ~1.5% drop in units
  • β between (-1, 0) is "inelastic"  → raising price increases revenue
  • β below -1            is "elastic"  → lowering price increases revenue
  • β ≥ 0 is anomalous (Veblen good or contaminated data)

No numpy. The math:
  β = Σ[(x - x̄)(y - ȳ)] / Σ[(x - x̄)²]
  α = ȳ - β · x̄
  R² = 1 - Σ[(y - ŷ)²] / Σ[(y - ȳ)²]

All edge cases are handled explicitly — sparse data, zero variance,
positive elasticity, promotional contamination — each producing a
flag on the ElasticityFit so the optimizer downstream can decide what
to do (fall back to competitor match, hold price, etc.).
"""
from __future__ import annotations

import math
from collections.abc import Iterable

from app.pricing.models import ElasticityFit, HistoricalObservation

MIN_OBSERVATIONS = 10
MIN_PRICE_LEVELS = 3       # need at least this many distinct prices to fit
MIN_PRICE_VARIANCE = 0.001  # log-price variance threshold


def estimate_elasticity(
    history: Iterable[HistoricalObservation],
    exclude_promotions: bool = True,
) -> ElasticityFit:
    """Fit log Q ~ α + β log P over the SKU's history.

    Promotional observations are excluded by default — they reflect
    a different demand curve and contaminate the elasticity estimate.
    """
    notes: list[str] = []

    points = [
        (h.price, h.units_sold)
        for h in history
        if h.price > 0
        and h.units_sold > 0
        and not (exclude_promotions and h.on_promotion)
    ]

    if len(points) < MIN_OBSERVATIONS:
        notes.append(
            f"Only {len(points)} usable observations (need ≥{MIN_OBSERVATIONS}).",
        )
        return ElasticityFit(
            beta=0.0,
            intercept=0.0,
            r_squared=0.0,
            n_observations=len(points),
            sufficient_data=False,
            notes=notes,
        )

    distinct_prices = {round(p, 2) for p, _ in points}
    if len(distinct_prices) < MIN_PRICE_LEVELS:
        notes.append(
            f"Only {len(distinct_prices)} distinct price levels — can't separate "
            "price effect from noise.",
        )
        return ElasticityFit(
            beta=0.0,
            intercept=0.0,
            r_squared=0.0,
            n_observations=len(points),
            sufficient_data=False,
            notes=notes,
        )

    log_prices = [math.log(p) for p, _ in points]
    log_quants = [math.log(q) for _, q in points]
    n = len(points)

    x_mean = sum(log_prices) / n
    y_mean = sum(log_quants) / n

    sum_xy = sum((x - x_mean) * (y - y_mean) for x, y in zip(log_prices, log_quants))
    sum_xx = sum((x - x_mean) ** 2 for x in log_prices)

    if sum_xx < MIN_PRICE_VARIANCE:
        notes.append("Log-price variance below threshold — fit unreliable.")
        return ElasticityFit(
            beta=0.0,
            intercept=0.0,
            r_squared=0.0,
            n_observations=n,
            sufficient_data=False,
            notes=notes,
        )

    beta = sum_xy / sum_xx
    intercept = y_mean - beta * x_mean

    # R² via residual sum of squares
    predicted = [intercept + beta * x for x in log_prices]
    ss_residual = sum((y - p) ** 2 for y, p in zip(log_quants, predicted))
    ss_total = sum((y - y_mean) ** 2 for y in log_quants)
    r_squared = 1.0 - (ss_residual / ss_total) if ss_total > 0 else 0.0
    # Clamp R² to [0, 1] — pathological data can push it negative.
    r_squared = max(0.0, min(1.0, r_squared))

    if beta >= 0:
        notes.append(
            f"β = {beta:.3f} is non-negative — possible Veblen good or "
            "contaminated history. Recommend human review.",
        )

    return ElasticityFit(
        beta=beta,
        intercept=intercept,
        r_squared=r_squared,
        n_observations=n,
        sufficient_data=True,
        notes=notes,
    )


def predict_quantity(fit: ElasticityFit, price: float) -> float:
    """Q(p) = exp(α + β log p). Returns 0 if fit is unusable."""
    if not fit.sufficient_data or price <= 0:
        return 0.0
    try:
        return math.exp(fit.intercept + fit.beta * math.log(price))
    except (OverflowError, ValueError):
        return 0.0
