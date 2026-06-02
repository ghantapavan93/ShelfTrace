"""Blast radius — quantify an incident as money-at-risk per day.

A grocery pricing operator does not triage by "an incident exists"; they triage
by dollars and velocity. A $0.50 overcharge on a slow SKU at one store is noise;
the same overcharge on milk (a KVI selling hundreds of units/day across a zone)
is a four-figure-per-day fire and a trust problem. This module turns a raw
incident into that number.

Pure derivation — same discipline as measurement.py / receipt.py: no new tables,
no writes, no audit events. It reads the per-unit price delta off the action and
the recent sales velocity off HistoricalSale, and multiplies. When velocity is
unknown (a brand-new uploaded SKU with no history) it says so honestly rather
than inventing a number.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import HistoricalSale, Incident, PriceAction


@dataclass
class BlastRadius:
    per_unit_delta: float          # |observed - approved| for one transaction
    daily_units: float | None      # avg units/day for this sku (None = unknown)
    daily_dollars_at_risk: float | None  # per_unit_delta * daily_units (None if unknown)
    has_velocity: bool             # did we have sales history to estimate from?
    is_kvi: bool                   # KVI items shape price image — weight them up
    basis: str                     # human-readable one-liner of the math/assumption

    def to_dict(self) -> dict:
        return asdict(self)


def _avg_daily_units(db: Session, sku: str) -> float | None:
    """Average units/day for a SKU from its recent sales history. Returns None
    when there is no history (e.g. a freshly uploaded SKU) — we never fabricate
    a velocity. Bounded: one aggregate query, sums units over distinct dates."""
    row = db.execute(
        select(
            func.coalesce(func.sum(HistoricalSale.units_sold), 0),
            func.count(func.distinct(func.date(HistoricalSale.date))),
        ).where(HistoricalSale.sku == sku)
    ).one()
    total_units, day_count = row[0] or 0, row[1] or 0
    if day_count == 0:
        return None
    return round(total_units / day_count, 1)


def for_incident(db: Session, incident: Incident, observed_price: float | None) -> BlastRadius:
    """Blast radius for one incident. ``observed_price`` is what the offending
    channel actually reported (the wrong price); for an implausible-price
    incident there is no channel divergence, so the delta is approved-vs-prior
    (how far the suspect price moved). Falls back gracefully when either side
    is missing."""
    action = db.get(PriceAction, incident.action_id)
    if action is None:
        return BlastRadius(0.0, None, None, False, False, "Action not found.")

    # Per-unit delta: prefer the real channel divergence; otherwise the size of
    # the suspect price move itself (implausible-price case).
    if observed_price is not None:
        per_unit = abs(observed_price - action.approved_price)
        delta_kind = "vs the price the register actually rang"
    else:
        per_unit = abs(action.approved_price - action.prior_price)
        delta_kind = "vs the prior price (no channel divergence on record)"

    daily_units = _avg_daily_units(db, action.sku)
    is_kvi = bool(action.is_kvi)

    if daily_units is None:
        return BlastRadius(
            per_unit_delta=round(per_unit, 2),
            daily_units=None,
            daily_dollars_at_risk=None,
            has_velocity=False,
            is_kvi=is_kvi,
            basis=(
                f"${per_unit:.2f} per unit {delta_kind}. No sales history for "
                f"{action.sku} yet, so daily exposure can't be estimated."
            ),
        )

    daily_dollars = round(per_unit * daily_units, 2)
    kvi_note = " This is a KVI item — errors here disproportionately shape price image." if is_kvi else ""
    return BlastRadius(
        per_unit_delta=round(per_unit, 2),
        daily_units=daily_units,
        daily_dollars_at_risk=daily_dollars,
        has_velocity=True,
        is_kvi=is_kvi,
        basis=(
            f"${per_unit:.2f}/unit {delta_kind} × ~{daily_units:g} units/day at this "
            f"store ≈ ${daily_dollars:,.2f}/day at risk.{kvi_note}"
        ),
    )
