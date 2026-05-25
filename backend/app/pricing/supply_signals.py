"""Supply-chain cost signals — futures prices, commodity hedges, supplier alerts.

When commodity prices spike (wheat, egg futures), our COGS rises. This module
injects forward-looking cost signals into pricing decisions: if eggs are expected
to spike 15% in 2 weeks, pre-emptively raise prices now to smooth margins over time.

Model: Track supplier cost forecasts, commodity futures, and hedge positions.
Adjust effective COGS upward/downward based on expected cost trajectory.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models import utcnow


@dataclass
class CostSignal:
    """A forward-looking cost adjustment."""

    signal_type: str  # "commodity_future" | "supplier_alert" | "hedge_position"
    commodity: str  # "eggs", "wheat", "milk"
    current_cost_idx: float  # index/price today
    forecasted_cost_idx: float  # index/price at forecast_date
    forecast_date: datetime
    confidence: float  # 0..1
    reason: str


def compute_effective_cogs(
    base_cost: float,
    cost_signals: list[CostSignal],
    horizon_days: int = 30,
) -> float:
    """Blend base COGS with forward-looking supply signals.

    If supply costs are trending up, bump effective COGS so we price
    preemptively. If trending down, we can optimize margin differently.

    Returns adjusted effective COGS.
    """
    if not cost_signals:
        return base_cost

    now = utcnow()
    future_cutoff = now + timedelta(days=horizon_days)

    # Weight signals by how soon they materialize + confidence
    total_weight = 0.0
    weighted_adjustment = 0.0

    for signal in cost_signals:
        if signal.forecast_date > future_cutoff:
            continue  # too far in future

        # How many days until this signal materializes?
        days_to_signal = (signal.forecast_date - now).days
        if days_to_signal < 0:
            continue  # signal already past

        # Weight: closer signals + higher confidence are stronger
        weight = signal.confidence * max(0.0, 1.0 - days_to_signal / horizon_days)
        total_weight += weight

        # Cost change from signal
        cost_delta_pct = (signal.forecasted_cost_idx - signal.current_cost_idx) / signal.current_cost_idx
        weighted_adjustment += weight * cost_delta_pct

    if total_weight == 0:
        return base_cost

    # Average adjustment, but cap at ±10% to avoid whipsaw
    avg_adjustment = weighted_adjustment / total_weight
    capped_adjustment = max(-0.10, min(0.10, avg_adjustment))

    return base_cost * (1.0 + capped_adjustment)


def example_egg_futures_signal() -> CostSignal:
    """Example: egg futures indicate a 12% cost increase in 3 weeks."""
    now = utcnow()
    forecast_date = now + timedelta(days=21)

    return CostSignal(
        signal_type="commodity_future",
        commodity="eggs",
        current_cost_idx=100.0,  # baseline
        forecasted_cost_idx=112.0,  # +12%
        forecast_date=forecast_date,
        confidence=0.70,
        reason="CME Lean Hog Index +12% over Feb-Mar contract; egg production cost correlated.",
    )


def example_supplier_alert() -> CostSignal:
    """Example: supplier announces 8% surcharge on dairy starting next month."""
    now = utcnow()
    forecast_date = now + timedelta(days=28)

    return CostSignal(
        signal_type="supplier_alert",
        commodity="milk",
        current_cost_idx=100.0,
        forecasted_cost_idx=108.0,
        forecast_date=forecast_date,
        confidence=0.95,  # high confidence — supplier said so
        reason="Acme Dairy announced 8% surcharge effective Feb 25; inflation + fuel costs.",
    )
