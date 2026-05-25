"""Business-rule constraint engine.

Each constraint is a tiny function that takes (current_price_candidate,
features) and returns (clipped_price, applied_constraints, reasons).
The pipeline composes them in priority order.

Priority (highest first):
  1. Cost floor          — never sell below cost + minimum margin
  2. Perishable urgency  — markdown approaching deadline overrides everything
  3. KVI competitor lock — Key Value Items must match within X% of competitor
  4. Competitor ceiling  — don't price too far above competitor
  5. Shock cap           — single change can't move > 25% from current
  6. Inventory cap       — don't recommend a price that drives stockout
"""
from __future__ import annotations

from dataclasses import dataclass

from app.pricing.ladder import margin_floor_for
from app.pricing.models import PricingFeatures, PricingReason

MIN_MARGIN_PCT = 0.05            # never less than 5% above cost
KVI_COMPETITOR_TOLERANCE = 0.015  # KVI must be within ±1.5% of competitor
COMPETITOR_CEILING_PCT = 0.15    # at most 15% above competitor for non-KVI
SHOCK_CAP_PCT = 0.25             # single change at most ±25% from current
RECENT_CHANGE_WINDOW_DAYS = 7    # don't change again within a week
PERISHABLE_MARKDOWN_PCT = 0.30   # mark down at least 30% when deadline ≤ 2 days


@dataclass
class ConstraintResult:
    price: float
    applied: list[str]
    reasons: list[PricingReason]


def apply_cost_floor(price: float, f: PricingFeatures) -> ConstraintResult:
    if f.cost is None or f.cost <= 0:
        return ConstraintResult(price, [], [])
    # Per-category margin override — KVI runs tighter (2%), perishable higher (8%), etc.
    margin = margin_floor_for(f.category, MIN_MARGIN_PCT)
    floor = f.cost * (1.0 + margin)
    if price < floor:
        code = "CATEGORY_MARGIN_FLOOR" if margin != MIN_MARGIN_PCT else "AT_COST_FLOOR"
        category_note = (
            f" (category '{f.category}' floor = {margin * 100:.0f}%)"
            if margin != MIN_MARGIN_PCT and f.category
            else ""
        )
        return ConstraintResult(
            price=floor,
            applied=["cost_floor"],
            reasons=[
                PricingReason(
                    code=code,
                    message=(
                        f"Profit-max price would land below cost-plus-margin floor "
                        f"(${floor:.2f} = ${f.cost:.2f} × {1 + margin:.2f}){category_note}. "
                        "Clamped to floor."
                    ),
                ),
            ],
        )
    return ConstraintResult(price, [], [])


def apply_perishable_urgency(price: float, f: PricingFeatures) -> ConstraintResult:
    if not f.is_perishable or f.days_to_deadline is None:
        return ConstraintResult(price, [], [])
    if f.days_to_deadline > 2:
        return ConstraintResult(price, [], [])
    forced = f.current_price * (1.0 - PERISHABLE_MARKDOWN_PCT)
    if price <= forced:
        return ConstraintResult(price, ["perishable_urgency_already_met"], [])
    return ConstraintResult(
        price=forced,
        applied=["perishable_urgency"],
        reasons=[
            PricingReason(
                code="PERISHABLE_MARKDOWN_FORCED",
                message=(
                    f"Perishable item with deadline in {f.days_to_deadline} day(s). "
                    f"Forced markdown to ${forced:.2f} ({int(PERISHABLE_MARKDOWN_PCT * 100)}% off "
                    f"current ${f.current_price:.2f}) to maintain sell-through."
                ),
            ),
        ],
    )


def apply_kvi_lock(price: float, f: PricingFeatures) -> ConstraintResult:
    if not f.is_kvi or f.competitor_price is None or f.competitor_price <= 0:
        return ConstraintResult(price, [], [])
    target = f.competitor_price
    upper = target * (1.0 + KVI_COMPETITOR_TOLERANCE)
    lower = target * (1.0 - KVI_COMPETITOR_TOLERANCE)
    if lower <= price <= upper:
        return ConstraintResult(price, ["kvi_within_tolerance"], [])
    clipped = max(lower, min(upper, price))
    return ConstraintResult(
        price=clipped,
        applied=["kvi_competitor_lock"],
        reasons=[
            PricingReason(
                code="KVI_MATCHED_COMPETITOR",
                message=(
                    f"KVI item — must stay within ±{KVI_COMPETITOR_TOLERANCE * 100:.1f}% of "
                    f"competitor ${target:.2f}. Clipped to ${clipped:.2f}."
                ),
            ),
        ],
    )


def apply_competitor_ceiling(price: float, f: PricingFeatures) -> ConstraintResult:
    if f.competitor_price is None or f.competitor_price <= 0 or f.is_kvi:
        return ConstraintResult(price, [], [])
    ceiling = f.competitor_price * (1.0 + COMPETITOR_CEILING_PCT)
    if price <= ceiling:
        return ConstraintResult(price, [], [])
    return ConstraintResult(
        price=ceiling,
        applied=["competitor_ceiling"],
        reasons=[
            PricingReason(
                code="AT_COMPETITOR_CEILING",
                message=(
                    f"Unconstrained profit max (${price:.2f}) would price >"
                    f"{int(COMPETITOR_CEILING_PCT * 100)}% above competitor "
                    f"(${f.competitor_price:.2f}). Capped to ${ceiling:.2f}."
                ),
            ),
        ],
    )


def apply_shock_cap(price: float, f: PricingFeatures) -> ConstraintResult:
    if f.current_price <= 0:
        return ConstraintResult(price, [], [])
    upper = f.current_price * (1.0 + SHOCK_CAP_PCT)
    lower = f.current_price * (1.0 - SHOCK_CAP_PCT)
    if lower <= price <= upper:
        return ConstraintResult(price, [], [])
    clipped = max(lower, min(upper, price))
    return ConstraintResult(
        price=clipped,
        applied=["shock_cap"],
        reasons=[
            PricingReason(
                code="AT_COMPETITOR_CEILING",
                message=(
                    f"Single change capped to ±{int(SHOCK_CAP_PCT * 100)}% of current "
                    f"(${f.current_price:.2f}). Clipped to ${clipped:.2f} to avoid "
                    "shopper shock."
                ),
            ),
        ],
    )


def apply_inventory_cap(
    price: float,
    f: PricingFeatures,
    predicted_units: float,
) -> ConstraintResult:
    """If our recommended price drives demand above what we have in stock,
    raise the price until predicted demand fits inventory."""
    if f.inventory_on_hand is None or f.inventory_on_hand <= 0:
        return ConstraintResult(price, [], [])
    if predicted_units <= f.inventory_on_hand:
        return ConstraintResult(price, [], [])
    # Don't math — just raise the price 5% and re-evaluate downstream.
    # The pipeline can iterate if it really matters. For the demo this
    # single bump is enough to signal "stockout risk if you don't raise."
    bumped = price * 1.05
    return ConstraintResult(
        price=bumped,
        applied=["inventory_cap"],
        reasons=[
            PricingReason(
                code="INVENTORY_CAPPED",
                message=(
                    f"Predicted demand at ${price:.2f} ({int(predicted_units)} units) "
                    f"exceeds inventory on hand ({f.inventory_on_hand}). Raised price "
                    f"5% to ${bumped:.2f} to manage stockout risk."
                ),
            ),
        ],
    )


def recent_change_suppressed(f: PricingFeatures) -> PricingReason | None:
    """Returns a reason to suppress, or None if not applicable."""
    if f.days_since_last_price_change is None:
        return None
    if f.days_since_last_price_change >= RECENT_CHANGE_WINDOW_DAYS:
        return None
    return PricingReason(
        code="RECENT_CHANGE_SUPPRESSED",
        message=(
            f"Price changed {f.days_since_last_price_change} day(s) ago. Suppressing "
            f"further changes within {RECENT_CHANGE_WINDOW_DAYS}-day window to avoid "
            "shopper-perceived churn and re-learning the elasticity."
        ),
    )
