"""Detect and adjust for demand cannibalization when pricing cross-category products.

When we raise the price of Product A, demand for substitutes (Product B, C, ...) may rise.
This module detects likely substitute relationships and adjusts recommendations.

Model: products are substitutes if they're in the same category, often purchased together,
or have strong inverse cross-price elasticity (A↑ → B demand↑). We estimate cross-elasticity
from historical co-purchases and intra-category competition.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models import HistoricalSale, ProductEntity, SKUProductLink
from app.scope import Scope, apply_filter
from app.services.product_graph import get_internal_history_for_entity


@dataclass
class SubstituteProduct:
    """A product that competes with or substitutes for the primary."""

    entity_id: str
    canonical_title: str
    category_id: Optional[str]
    estimated_cross_elasticity: float  # how much B demand rises when A price rises
    confidence: float  # 0..1


def estimate_cross_elasticity(
    db: Session,
    primary_entity_id: str,
    secondary_entity_id: str,
    lookback_days: int = 90,
) -> float:
    """Heuristic estimate of cross-elasticity: how much does B demand rise when A price rises?

    Returns a signed float:
      • Positive: substitutes (A↑ → B↑)
      • Negative: complements (A↑ → B↓)
      • Near zero: unrelated
    """
    # Get sales history for both products
    primary_history = get_internal_history_for_entity(db, primary_entity_id)
    secondary_history = get_internal_history_for_entity(db, secondary_entity_id)

    if not primary_history or not secondary_history:
        return 0.0  # no data

    # Simple heuristic: if both products saw concurrent price drops → likely complements.
    # If one dropped while other held → likely substitutes.
    primary_price_changes = [h.price for h in sorted(primary_history, key=lambda x: x.date.replace(tzinfo=None))]
    secondary_price_changes = [h.price for h in sorted(secondary_history, key=lambda x: x.date.replace(tzinfo=None))]

    if len(primary_price_changes) < 3 or len(secondary_price_changes) < 3:
        return 0.0  # need more history

    # Compute correlation direction (real systems use OLS regression on contemporaneous moves)
    primary_trend = sum(1 for i in range(1, len(primary_price_changes)) if primary_price_changes[i] > primary_price_changes[i - 1])
    secondary_trend = sum(1 for i in range(1, len(secondary_price_changes)) if secondary_price_changes[i] > secondary_price_changes[i - 1])

    # If one product raised price while the other dropped, they're likely substitutes
    if (primary_trend > len(primary_price_changes) / 2) and (secondary_trend < len(secondary_price_changes) / 2):
        return 0.3  # moderate substitution

    return 0.0


def find_substitute_products(
    db: Session,
    primary_entity_id: str,
    same_category_only: bool = False,
    scope: Scope = Scope.ALL,
) -> list[SubstituteProduct]:
    """Find products that compete with the primary entity.

    Heuristic: products in the same category with non-zero cross-elasticity.
    Real systems use learned embeddings to find substitutes regardless of category.

    `scope` keeps the candidate set on the same side of the Live/Demo
    boundary — a Live-mode entity shouldn't surface demo-seeded products as
    its substitutes. Defaults to ALL so non-scoped callers are unaffected.
    """
    primary = db.scalar(select(ProductEntity).where(ProductEntity.id == primary_entity_id))
    if not primary:
        return []

    # Query all other products in the same category (if same_category_only)
    query = select(ProductEntity).where(ProductEntity.id != primary_entity_id)
    if same_category_only and primary.category_id:
        query = query.where(ProductEntity.category_id == primary.category_id)
    elif primary.category_id:
        # Also include nearby categories (dairy → non-dairy milk)
        query = query.where(
            (ProductEntity.category_id == primary.category_id)
            | (ProductEntity.category_id == None)  # noqa: E712
        )
    query = apply_filter(query, ProductEntity.source_run_id, scope)

    candidates = db.scalars(query).all()

    substitutes = []
    for candidate in candidates:
        cross_elast = estimate_cross_elasticity(db, primary_entity_id, candidate.id)
        if abs(cross_elast) > 0.05:  # threshold: must be meaningful
            substitutes.append(
                SubstituteProduct(
                    entity_id=candidate.id,
                    canonical_title=candidate.canonical_title,
                    category_id=candidate.category_id,
                    estimated_cross_elasticity=cross_elast,
                    confidence=0.5,  # low confidence with heuristic; higher with ML
                )
            )

    return sorted(substitutes, key=lambda s: abs(s.estimated_cross_elasticity), reverse=True)


def adjust_for_cannibalization(
    recommended_price: float,
    current_price: float,
    primary_entity_id: str,
    substitute_products: list[SubstituteProduct],
    cannibalization_threshold: float = 0.15,
) -> tuple[float, str | None]:
    """Adjust the recommended price if cannibalization risk is high.

    If raising price on A by 10% would cannibalize 20% of B's demand, we might
    reduce the raise to 5% to protect total margin.

    Returns (adjusted_price, reason).
    """
    price_delta_pct = (recommended_price - current_price) / current_price if current_price > 0 else 0.0

    # Simple model: if we're raising the price by > 10% AND there are moderate
    # substitutes with positive cross-elasticity, reduce the raise slightly.
    if price_delta_pct < 0.10:
        return recommended_price, None  # small raises don't cannibalize much

    strong_substitutes = [s for s in substitute_products if s.estimated_cross_elasticity > 0.20]
    if not strong_substitutes:
        return recommended_price, None

    # Reduce the price increase proportionally to number of strong substitutes
    # (simple heuristic; real systems model basket margin impact)
    reduction_factor = 1.0 - (0.05 * len(strong_substitutes))
    adjusted = current_price + (recommended_price - current_price) * max(0.5, reduction_factor)

    reason = f"Cannibalization risk: {len(strong_substitutes)} strong substitute(s) detected. Reduced price raise from +{price_delta_pct*100:.1f}% to +{(adjusted-current_price)/current_price*100:.1f}%."
    return adjusted, reason
