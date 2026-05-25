"""Pricing engine data shapes.

All pure dataclasses — no SQLAlchemy here. Persistence lives in
app.models (HistoricalSale, PricingRecommendation rows). These shapes
are what flows through the pipeline functions.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as date_t
from typing import Literal


# ──────────────────────────────────────────────────────────────────────
# Inputs
# ──────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class HistoricalObservation:
    """One (date, price, units_sold) tuple for a SKU at a store."""

    date: date_t
    price: float
    units_sold: int
    on_promotion: bool = False  # excluded from elasticity fit (avoids contamination)


@dataclass
class PricingFeatures:
    """Everything the optimizer needs for one SKU·store decision."""

    sku: str
    store_id: str
    product_name: str
    current_price: float
    cost: float                         # unit cost (COGS)
    competitor_price: float | None = None
    is_kvi: bool = False
    is_perishable: bool = False
    days_to_deadline: int | None = None  # for perishables
    inventory_on_hand: int | None = None  # for stockout-risk capping
    days_since_last_price_change: int | None = None
    history: list[HistoricalObservation] = field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────
# Intermediates
# ──────────────────────────────────────────────────────────────────────
@dataclass
class ElasticityFit:
    """Result of the OLS log-log regression on the SKU's history.

    `beta` is the price elasticity of demand. By economic convention
    it's reported as a NEGATIVE number (lower price → more demand).
      • β between -1 and 0 → inelastic (raising price increases revenue)
      • β below -1         → elastic (lowering price increases revenue)
      • β above 0          → Veblen good or contaminated data; flag for review

    `r_squared` is 0..1 — how much of demand variance the price explains.
    `n_observations` is the count of price/quantity pairs that went into the fit.
    `sufficient_data` is False if we don't have enough variation to trust β.
    """

    beta: float
    intercept: float                 # α in log Q = α + β log P
    r_squared: float
    n_observations: int
    sufficient_data: bool
    notes: list[str] = field(default_factory=list)

    @property
    def is_elastic(self) -> bool:
        return self.beta < -1.0

    @property
    def is_inelastic(self) -> bool:
        return -1.0 <= self.beta < 0.0


# ──────────────────────────────────────────────────────────────────────
# Outputs
# ──────────────────────────────────────────────────────────────────────
ReasonCode = Literal[
    "INSUFFICIENT_HISTORY",
    "NO_PRICE_VARIANCE",
    "RECENT_CHANGE_SUPPRESSED",
    "MISSING_COST",
    "VEBLEN_FLAGGED",
    "AT_COST_FLOOR",
    "AT_COMPETITOR_CEILING",
    "KVI_MATCHED_COMPETITOR",
    "PERISHABLE_MARKDOWN_FORCED",
    "INELASTIC_RAISED_TO_CEILING",
    "ELASTIC_OPTIMIZED",
    "NO_CHANGE_NEEDED",
    "INVENTORY_CAPPED",
]


@dataclass
class PricingReason:
    """One human-readable note attached to a recommendation, with a
    machine-readable code so downstream systems can filter / route."""

    code: ReasonCode
    message: str


@dataclass
class PricingRecommendation:
    """The output of recommend_for_sku()."""

    sku: str
    store_id: str
    product_name: str
    current_price: float
    recommended_price: float
    expected_units_lift_pct: float       # % change in expected units sold
    expected_revenue_lift: float         # $ per period (vs current price)
    expected_profit_lift: float          # $ per period (margin · units)
    confidence: float                    # 0..1, derived from R² + n
    elasticity: ElasticityFit | None
    reasons: list[PricingReason] = field(default_factory=list)
    applied_constraints: list[str] = field(default_factory=list)

    @property
    def is_change(self) -> bool:
        return abs(self.recommended_price - self.current_price) > 0.005
