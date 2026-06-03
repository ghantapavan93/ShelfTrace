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
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.scope import is_demo, same_scope_side
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
from app.pricing.ladder import snap_to_ladder
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


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _days_until(deadline: datetime | None, now: datetime | None = None) -> int | None:
    if deadline is None:
        return None
    current = _as_utc(now or datetime.now(timezone.utc))
    return (_as_utc(deadline) - current).days


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

    # NEW: confidence-interval gate. If β's 95% CI straddles zero,
    # the elasticity is not statistically distinguishable from "no
    # relationship" — we shouldn't act on it. Hold price.
    if not fit.is_statistically_significant:
        reasons.append(
            PricingReason(
                code="CI_STRADDLES_ZERO",
                message=(
                    f"β = {fit.beta:.2f} (95% CI [{fit.beta_ci_low:.2f}, "
                    f"{fit.beta_ci_high:.2f}]) — interval crosses zero so the "
                    "estimate is not statistically distinguishable from no "
                    "relationship. Holding price until more observations arrive."
                ),
            ),
        )
        return _no_change(features, reasons=reasons, fit=fit)

    # NEW: external signal acknowledgement (signals already multiplied
    # into the demand model upstream; here we record WHY for reasoning).
    if features.external_demand_multiplier != 1.0 and features.matched_signals:
        reasons.append(
            PricingReason(
                code="EXTERNAL_SIGNAL_APPLIED",
                message=(
                    f"Demand multiplier {features.external_demand_multiplier:.2f}× "
                    f"applied from active signals: {', '.join(features.matched_signals)}. "
                    "Optimizer sees boosted demand and prices accordingly."
                ),
            ),
        )

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

    # NEW: psychological pricing ladder — snap raw $4.7384 to $4.79 etc.
    # Done AFTER all hard constraints so the snap can't violate a floor
    # or ceiling. If the snap would push outside a constraint, we keep
    # the constraint-clipped value instead.
    snapped = snap_to_ladder(candidate)
    if abs(snapped - candidate) > 0.005:
        reasons.append(
            PricingReason(
                code="SNAPPED_TO_LADDER",
                message=(
                    f"Raw optimum ${candidate:.4f} snapped to ${snapped:.2f} "
                    "(psychological pricing ladder)."
                ),
            ),
        )
        constraints_applied.append("price_ladder")
        candidate = snapped

    # ── Re-assert the cost floor as the FINAL hard guard ──────────────
    # Downward constraints that run AFTER the initial cost-floor check — KVI lock,
    # competitor ceiling, and the shock cap clamping toward a low current_price —
    # plus the ladder snap, can each drag the price back BELOW cost+margin. The
    # cost floor is priority #1, so re-clamp here to guarantee a recommendation is
    # never below cost. The ONE legitimate below-cost case is a perishable being
    # marked down to clear before its deadline (priority #2 intentionally overrides
    # the floor), so skip the re-floor for an item in its perishable clear-out window.
    _perishable_clearout = (
        features.is_perishable
        and features.days_to_deadline is not None
        and features.days_to_deadline <= 2
    )
    if not _perishable_clearout:
        refloor = apply_cost_floor(candidate, features)
        if refloor.price > candidate + 1e-9:
            candidate = refloor.price
            constraints_applied.append("cost_floor_reasserted")
            reasons.append(
                PricingReason(
                    code="COST_FLOOR_REASSERTED",
                    message=(
                        f"A later constraint had clipped the price below the "
                        f"cost-plus-margin floor; re-clamped to ${candidate:.2f} so the "
                        "recommendation never sells below cost."
                    ),
                )
            )

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
    # Per-period expected lifts. Demand multiplied by any active external
    # signals so the projection reflects boosted-demand conditions.
    mult = features.external_demand_multiplier
    cur_units = (predict_quantity(fit, features.current_price) if fit and fit.sufficient_data else 0.0) * mult
    new_units = predicted_units_new * mult
    units_lift_pct = ((new_units - cur_units) / cur_units * 100) if cur_units > 0 else 0.0

    rev_cur = (expected_revenue(fit, features.current_price) if fit else 0.0) * mult
    rev_new = (expected_revenue(fit, recommended) if fit else 0.0) * mult
    rev_lift = rev_new - rev_cur

    prof_cur = (expected_profit(fit, features.current_price, features.cost) if fit else 0.0) * mult
    prof_new = (expected_profit(fit, recommended, features.cost) if fit else 0.0) * mult
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

    New: doesn't WIPE prior unapplied recommendations — supersedes them.
    Each new rec's row gets a fresh id; the previous rec for the same
    (sku, store_id) gets `superseded_by` set to point at the new id, so
    the history of "what we said yesterday" is preserved.
    """
    from app.models import (
        CompetitorProduct,
        ExternalSignal as DBExternalSignal,
        HistoricalSale,
        PriceAction,
        PriceBatch,
        PricingRecommendation as DBPricingRecommendation,
        ProductCost,
    )
    from app.pricing.signals import ExternalSignal as PricingSignal, combined_multiplier
    import uuid

    # Pre-fetch source_run_id per batch so each new PricingRecommendation
    # inherits the same scope as its parent PriceAction's batch. Without
    # this, engine output lands with NULL source_run_id and Live mode
    # would surface demo recommendations as if they were user-uploaded.
    #
    # Select only (id, source_run_id) rather than whole PriceBatch ORM
    # objects — the engine runs over the entire catalog, and materializing
    # every batch row (with its JSON columns) just to read two scalars
    # scales memory with total batch count, not with relevant data.
    batch_source_map: dict[str, str | None] = {
        row.id: row.source_run_id
        for row in db.execute(select(PriceBatch.id, PriceBatch.source_run_id))
    }

    # Cost catalog keyed by (sku, demo-side) so a demo cost can't set the
    # cost basis for a user rec (and vice versa) when a SKU exists in both
    # scopes. The engine processes the whole catalog in one pass, so every
    # input map must be scope-disambiguated, not just sku-keyed.
    cost_map: dict[tuple[str, bool], float] = {
        (c.sku, is_demo(c.source_run_id)): c.cost for c in db.scalars(select(ProductCost))
    }
    competitor_map: dict[str, float] = {}
    for cp in db.scalars(select(CompetitorProduct)):
        competitor_map.setdefault(cp.title.lower()[:32], cp.price)

    # Load active external signals WITH their scope tag. A signal may only
    # influence recommendations on the same side of the Live/Demo boundary —
    # otherwise the seeded Memorial Day demand-boost would silently inflate
    # every user-scoped rec's expected lift.
    active_signals_scoped: list[tuple[PricingSignal, str | None]] = [
        (
            PricingSignal(
                name=s.name,
                signal_type=s.signal_type,
                multiplier=s.multiplier,
                effective_from=s.effective_from,
                effective_until=s.effective_until,
                category_pattern=s.category_pattern,
                sku_pattern=s.sku_pattern,
            ),
            s.source_run_id,
        )
        for s in db.scalars(select(DBExternalSignal))
    ]

    # History buckets keyed by (sku, store, demo-side) so demo and user
    # observations for the same SKU·store never merge into one elasticity fit.
    history_buckets: dict[tuple[str, str, bool], list[HistoricalObservation]] = {}
    for sale in db.scalars(
        select(HistoricalSale).order_by(HistoricalSale.date.asc()),
    ):
        key = (sale.sku, sale.store_id, is_demo(sale.source_run_id))
        history_buckets.setdefault(key, []).append(
            HistoricalObservation(
                date=sale.date.date() if hasattr(sale.date, "date") else sale.date,
                price=sale.price,
                units_sold=sale.units_sold,
                on_promotion=sale.on_promotion,
            ),
        )

    # Latest action per (sku, store, demo-side) — the action's parent batch
    # scope decides which side it's on.
    latest_action_per_sku: dict[tuple[str, str, bool], PriceAction] = {}
    for a in db.scalars(select(PriceAction).order_by(PriceAction.id.asc())):
        side = is_demo(batch_source_map.get(a.batch_id))
        latest_action_per_sku[(a.sku, a.store_id, side)] = a

    new_recs: list[DBPricingRecommendation] = []
    summary = {"scanned": 0, "recommended": 0, "skipped": 0, "superseded": 0}

    for (sku, store_id, side), history in history_buckets.items():
        summary["scanned"] += 1
        action = latest_action_per_sku.get((sku, store_id, side))
        if not action:
            summary["skipped"] += 1
            continue

        # Derive category from KVI / perishable flags (production would be a real catalog join)
        category = (
            "kvi" if action.is_kvi
            else "perishable" if action.markdown_deadline is not None
            else None
        )

        # Apply only the signals on this rec's side of the Live/Demo boundary.
        rec_scope = batch_source_map.get(action.batch_id)
        applicable_signals = [
            sig for sig, srid in active_signals_scoped
            if same_scope_side(srid, rec_scope)
        ]
        mult = combined_multiplier(applicable_signals, sku, category)
        matched = [
            s.name for s in applicable_signals
            if s.is_active() and s.applies_to(sku, category)
        ]

        features = PricingFeatures(
            sku=sku,
            store_id=store_id,
            product_name=action.product_name,
            current_price=action.approved_price,
            cost=cost_map.get((sku, side), action.approved_price * 0.6),
            competitor_price=competitor_map.get(action.product_name.lower()[:32]),
            is_kvi=action.is_kvi,
            is_perishable=action.markdown_deadline is not None,
            days_to_deadline=_days_until(action.markdown_deadline),
            category=category,
            external_demand_multiplier=mult,
            matched_signals=matched,
            history=history,
        )
        rec = recommend_for_sku(features)
        if rec.is_change:
            summary["recommended"] += 1

        new_id = f"prec_{uuid.uuid4().hex[:12]}"
        new_recs.append(
            DBPricingRecommendation(
                id=new_id,
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
                elasticity_beta_se=rec.elasticity.beta_se if rec.elasticity else None,
                elasticity_ci_low=rec.elasticity.beta_ci_low if rec.elasticity else None,
                elasticity_ci_high=rec.elasticity.beta_ci_high if rec.elasticity else None,
                elasticity_r2=rec.elasticity.r_squared if rec.elasticity else None,
                elasticity_n=rec.elasticity.n_observations if rec.elasticity else None,
                reasons_json={
                    "reasons": [{"code": r.code, "message": r.message} for r in rec.reasons],
                    "constraints": rec.applied_constraints,
                    "matched_signals": matched,
                    "demand_multiplier": mult,
                },
                applied=False,
                source_run_id=batch_source_map.get(action.batch_id),
                created_at=datetime.now(timezone.utc),
            ),
        )

    # NEW: instead of wiping, mark prior latest rec for each (sku, store)
    # as superseded_by the new one. Preserves history for audit + diff.
    db.add_all(new_recs)
    db.flush()  # so new IDs are settled

    for new_rec in new_recs:
        latest_existing = db.scalar(
            select(DBPricingRecommendation)
            .where(DBPricingRecommendation.sku == new_rec.sku)
            .where(DBPricingRecommendation.store_id == new_rec.store_id)
            .where(DBPricingRecommendation.id != new_rec.id)
            .where(DBPricingRecommendation.applied == False)  # noqa: E712
            .where(DBPricingRecommendation.superseded_by.is_(None))
            .order_by(DBPricingRecommendation.created_at.desc())
            .limit(1),
        )
        if latest_existing is not None:
            latest_existing.superseded_by = new_rec.id
            summary["superseded"] += 1

    db.commit()
    summary["persisted"] = len(new_recs)
    return summary
