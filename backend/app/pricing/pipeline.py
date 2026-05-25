"""End-to-end pricing pipeline.

Given PricingFeatures for one SKU·store, produce a PricingRecommendation
with the chosen price, expected lifts, confidence score, and a complete
reasoning trail that a pricing analyst could follow without inspecting
the code.

Flow:
  1. Estimate elasticity from historical sales (excluding promos)
  2. If insufficient data → fall back to "no change" or competitor match
  3. If recent change → suppress (return current price + reason)
  4. Compute unconstrained profit-max p* = β·c / (β+1)
  5. Run p* through the constraint chain in priority order:
        cost floor → perishable → KVI → competitor ceiling → shock cap → inventory
  6. Compute expected unit / revenue / profit lifts vs current
  7. Score confidence (combines R² + n + constraint count)
  8. Bundle and return
"""
from __future__ import annotations

import math
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.pricing.constraints import (
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
    PricingRecommendation,
    PricingReason,
)
from app.pricing.optimizer import (
    expected_profit,
    expected_revenue,
    unconstrained_optimal_price,
)


def recommend_for_sku(features: PricingFeatures) -> PricingRecommendation:
    reasons: list[PricingReason] = []
    constraints_applied: list[str] = []

    # ── 0. Cost sanity ────────────────────────────────────────────
    if features.cost is None or features.cost <= 0:
        reasons.append(
            PricingReason(
                code="MISSING_COST",
                message="No cost data — cannot compute margin. Holding current price.",
            ),
        )
        return _no_change(features, reasons=reasons, fit=None)

    # ── 1. Recent-change suppression ──────────────────────────────
    if (reason := recent_change_suppressed(features)) is not None:
        reasons.append(reason)
        return _no_change(features, reasons=reasons, fit=None)

    # ── 2. Elasticity fit ─────────────────────────────────────────
    fit = estimate_elasticity(features.history)
    if not fit.sufficient_data:
        reasons.append(
            PricingReason(
                code="INSUFFICIENT_HISTORY"
                if fit.n_observations < 10
                else "NO_PRICE_VARIANCE",
                message=" · ".join(fit.notes) or "Cannot fit elasticity.",
            ),
        )
        # Fallback: if KVI with competitor → match competitor (within tolerance)
        if features.is_kvi and features.competitor_price:
            target = features.competitor_price
            reasons.append(
                PricingReason(
                    code="KVI_MATCHED_COMPETITOR",
                    message=(
                        f"KVI fallback — competitor at ${target:.2f}, matching."
                    ),
                ),
            )
            return _bundle(
                features=features,
                recommended=target,
                fit=fit,
                reasons=reasons,
                constraints_applied=["kvi_fallback"],
                predicted_units_new=features.history[-1].units_sold if features.history else 0,
            )
        return _no_change(features, reasons=reasons, fit=fit)

    if fit.beta >= 0:
        reasons.append(
            PricingReason(
                code="VEBLEN_FLAGGED",
                message=(
                    f"β = {fit.beta:.2f} ≥ 0 — demand rose with price. Possible "
                    "Veblen good, promotional cannibalization, or contaminated "
                    "history. Flagging for human review; holding current price."
                ),
            ),
        )
        return _no_change(features, reasons=reasons, fit=fit)

    # ── 3. Unconstrained optimum ──────────────────────────────────
    p_star = unconstrained_optimal_price(fit.beta, features.cost)

    if p_star is None:
        # Inelastic: π monotonic in p → raise to ceiling
        if fit.is_inelastic:
            ceiling = (
                features.competitor_price * 1.15
                if features.competitor_price
                else features.current_price * 1.25
            )
            reasons.append(
                PricingReason(
                    code="INELASTIC_RAISED_TO_CEILING",
                    message=(
                        f"β = {fit.beta:.2f} is inelastic — π monotonic in price. "
                        f"Raising to ceiling ${ceiling:.2f}."
                    ),
                ),
            )
            candidate = ceiling
        else:
            # Degenerate (β = -1 exactly, or extreme): no recommendation
            return _no_change(features, reasons=reasons, fit=fit)
    else:
        reasons.append(
            PricingReason(
                code="ELASTIC_OPTIMIZED",
                message=(
                    f"β = {fit.beta:.2f} (R² = {fit.r_squared:.2f}, "
                    f"n = {fit.n_observations}). Unconstrained profit-max p* = "
                    f"β·c / (β+1) = ${p_star:.2f}."
                ),
            ),
        )
        candidate = p_star

    # ── 4. Constraint chain in priority order ──────────────────────
    for fn in (
        apply_cost_floor,
        apply_perishable_urgency,
        apply_kvi_lock,
        apply_competitor_ceiling,
        apply_shock_cap,
    ):
        result = fn(candidate, features)
        candidate = result.price
        constraints_applied.extend(result.applied)
        reasons.extend(result.reasons)

    # Inventory cap needs predicted demand at the post-constraint price
    pred_units = predict_quantity(fit, candidate)
    inv_result = apply_inventory_cap(candidate, features, pred_units)
    candidate = inv_result.price
    constraints_applied.extend(inv_result.applied)
    reasons.extend(inv_result.reasons)

    # ── 5. Final no-change check ──────────────────────────────────
    if abs(candidate - features.current_price) < 0.01:
        reasons.append(
            PricingReason(
                code="NO_CHANGE_NEEDED",
                message="Recommended price within $0.01 of current. Holding.",
            ),
        )
        return _no_change(features, reasons=reasons, fit=fit)

    return _bundle(
        features=features,
        recommended=candidate,
        fit=fit,
        reasons=reasons,
        constraints_applied=constraints_applied,
        predicted_units_new=predict_quantity(fit, candidate),
    )


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────
def _no_change(
    features: PricingFeatures,
    reasons: list[PricingReason],
    fit,
) -> PricingRecommendation:
    return PricingRecommendation(
        sku=features.sku,
        store_id=features.store_id,
        product_name=features.product_name,
        current_price=features.current_price,
        recommended_price=features.current_price,
        expected_units_lift_pct=0.0,
        expected_revenue_lift=0.0,
        expected_profit_lift=0.0,
        confidence=_confidence(fit, len(reasons)),
        elasticity=fit,
        reasons=reasons,
        applied_constraints=[],
    )


def _bundle(
    features: PricingFeatures,
    recommended: float,
    fit,
    reasons: list[PricingReason],
    constraints_applied: list[str],
    predicted_units_new: float,
) -> PricingRecommendation:
    # Per-period expected lifts. Period = whatever the history is in
    # (typically daily). The number is dimensionally correct either way.
    cur_units = predict_quantity(fit, features.current_price) if fit and fit.sufficient_data else 0.0
    new_units = predicted_units_new
    units_lift_pct = ((new_units - cur_units) / cur_units * 100) if cur_units > 0 else 0.0

    rev_cur = expected_revenue(fit, features.current_price) if fit else 0.0
    rev_new = expected_revenue(fit, recommended) if fit else 0.0
    rev_lift = rev_new - rev_cur

    prof_cur = expected_profit(fit, features.current_price, features.cost) if fit else 0.0
    prof_new = expected_profit(fit, recommended, features.cost) if fit else 0.0
    prof_lift = prof_new - prof_cur

    return PricingRecommendation(
        sku=features.sku,
        store_id=features.store_id,
        product_name=features.product_name,
        current_price=features.current_price,
        recommended_price=round(recommended, 2),
        expected_units_lift_pct=round(units_lift_pct, 1),
        expected_revenue_lift=round(rev_lift, 2),
        expected_profit_lift=round(prof_lift, 2),
        confidence=_confidence(fit, len(reasons)),
        elasticity=fit,
        reasons=reasons,
        applied_constraints=constraints_applied,
    )


def _confidence(fit, n_reasons: int) -> float:
    """0..1 score combining elasticity fit quality and reason simplicity.

    More reasons = more constraints triggered = lower confidence (the
    recommendation was forced by business rules, not the model).
    """
    if fit is None or not fit.sufficient_data:
        return 0.0
    n_factor = min(1.0, fit.n_observations / 90.0)  # saturates at 90 days
    r2_factor = max(0.0, min(1.0, fit.r_squared))
    base = 0.5 * n_factor + 0.5 * r2_factor
    # Each extra reason past the first 2 reduces confidence
    constraint_penalty = max(0.0, (n_reasons - 2) * 0.05)
    return round(max(0.0, base - constraint_penalty), 3)


# ──────────────────────────────────────────────────────────────────────
# Engine runner — load features from DB, run per SKU, persist
# ──────────────────────────────────────────────────────────────────────
def run_pricing_engine(db: Session) -> dict:
    """Run recommend_for_sku() over every SKU·store with history, persist
    the recommendations, return a summary dict.

    Imports done lazily so importing the pipeline doesn't drag in
    SQLAlchemy models when only the math is needed (e.g., in tests)."""
    from app.models import (
        CompetitorProduct,
        HistoricalSale,
        PriceAction,
        PricingRecommendation as DBPricingRecommendation,
        ProductCost,
    )
    from datetime import datetime, timezone, timedelta
    import uuid

    # Build PricingFeatures from joined sources
    cost_map: dict[str, float] = {
        c.sku: c.cost for c in db.scalars(select(ProductCost))
    }
    competitor_map: dict[str, float] = {}
    for cp in db.scalars(select(CompetitorProduct)):
        # Map by a synthetic sku-shape lookup (demo doesn't have a fuzzy join yet).
        # In production we'd join via the product knowledge graph.
        competitor_map.setdefault(cp.title.lower()[:32], cp.price)

    # Group historical sales by (sku, store_id)
    history_buckets: dict[tuple[str, str], list[HistoricalObservation]] = {}
    for sale in db.scalars(
        select(HistoricalSale).order_by(HistoricalSale.date.asc()),
    ):
        key = (sale.sku, sale.store_id)
        history_buckets.setdefault(key, []).append(
            HistoricalObservation(
                date=sale.date.date() if hasattr(sale.date, "date") else sale.date,
                price=sale.price,
                units_sold=sale.units_sold,
                on_promotion=sale.on_promotion,
            ),
        )

    # Build feature dict from the latest PriceActions (current_price + product_name)
    latest_action_per_sku: dict[tuple[str, str], PriceAction] = {}
    for a in db.scalars(select(PriceAction).order_by(PriceAction.id.asc())):
        latest_action_per_sku[(a.sku, a.store_id)] = a

    recs: list[DBPricingRecommendation] = []
    summary = {"scanned": 0, "recommended": 0, "skipped": 0}

    for (sku, store_id), history in history_buckets.items():
        summary["scanned"] += 1
        action = latest_action_per_sku.get((sku, store_id))
        if not action:
            summary["skipped"] += 1
            continue
        features = PricingFeatures(
            sku=sku,
            store_id=store_id,
            product_name=action.product_name,
            current_price=action.approved_price,
            cost=cost_map.get(sku, action.approved_price * 0.6),  # fallback 60% cost
            competitor_price=competitor_map.get(action.product_name.lower()[:32]),
            is_kvi=action.is_kvi,
            is_perishable=action.markdown_deadline is not None,
            days_to_deadline=(
                (action.markdown_deadline - datetime.now(timezone.utc)).days
                if action.markdown_deadline else None
            ),
            history=history,
        )
        rec = recommend_for_sku(features)
        if rec.is_change:
            summary["recommended"] += 1

        recs.append(
            DBPricingRecommendation(
                id=f"prec_{uuid.uuid4().hex[:12]}",
                sku=rec.sku,
                store_id=rec.store_id,
                product_name=rec.product_name,
                current_price=rec.current_price,
                recommended_price=rec.recommended_price,
                expected_units_lift_pct=rec.expected_units_lift_pct,
                expected_revenue_lift=rec.expected_revenue_lift,
                expected_profit_lift=rec.expected_profit_lift,
                confidence=rec.confidence,
                elasticity_beta=rec.elasticity.beta if rec.elasticity else None,
                elasticity_r2=rec.elasticity.r_squared if rec.elasticity else None,
                elasticity_n=rec.elasticity.n_observations if rec.elasticity else None,
                reasons_json={
                    "reasons": [{"code": r.code, "message": r.message} for r in rec.reasons],
                    "constraints": rec.applied_constraints,
                },
                applied=False,
                created_at=datetime.now(timezone.utc),
            ),
        )

    # Wipe previous unapplied recommendations and write fresh ones
    db.query(DBPricingRecommendation).filter(
        DBPricingRecommendation.applied == False,  # noqa: E712
    ).delete()
    db.add_all(recs)
    db.commit()
    summary["persisted"] = len(recs)
    return summary
