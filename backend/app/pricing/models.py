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
    category: str | None = None          # used for category-margin overrides
    external_demand_multiplier: float = 1.0  # from active signals
    matched_signals: list[str] = field(default_factory=list)  # for reasoning
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

    `beta_se`, `beta_ci_low`, `beta_ci_high` are the standard error of β
    and the 95% confidence interval. Computed from the OLS residuals so
    the optimizer can know how trustworthy the point estimate is.
    """

    beta: float
    intercept: float                 # α in log Q = α + β log P
    r_squared: float
    n_observations: int
    sufficient_data: bool
    beta_se: float = 0.0             # standard error of β
    beta_ci_low: float = 0.0         # 95% CI lower bound
    beta_ci_high: float = 0.0        # 95% CI upper bound
    notes: list[str] = field(default_factory=list)

    @property
    def is_elastic(self) -> bool:
        return self.beta < -1.0

    @property
    def is_inelastic(self) -> bool:
        return -1.0 <= self.beta < 0.0

    @property
    def is_statistically_significant(self) -> bool:
        """β is significantly different from zero at 95% if its CI
        does not straddle 0. Used by the optimizer to decide whether
        the model is trustworthy enough to override the current price."""
        if not self.sufficient_data:
            return False
        return self.beta_ci_low * self.beta_ci_high > 0  # same sign on both bounds


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
    "CI_STRADDLES_ZERO",
    "EXTERNAL_SIGNAL_APPLIED",
    "SNAPPED_TO_LADDER",
    "CATEGORY_MARGIN_FLOOR",
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
