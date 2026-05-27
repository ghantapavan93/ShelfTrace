"""Pricing engine API."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ExternalSignal,
    HistoricalSale,
    PriceAction,
    PriceBatch,
    PricingRecommendation,
    ProductCost,
)
from app.scope import Scope, apply_filter, current_scope
from app.pricing.elasticity import estimate_elasticity
from app.pricing.models import HistoricalObservation
from app.pricing.pipeline import run_pricing_engine
from app.pricing.seed import seed_history
from app.security import Identity, require_operator
from app.services import product_graph

router = APIRouter(prefix="/api/v1/pricing", tags=["pricing"])


class ApplyRecommendationRequest(BaseModel):
    approval_note: str | None = None
    approval_policy: str = "operator_review"
    approved_by: str | None = None


@router.post("/seed-history", status_code=201)
def seed(db: Session = Depends(get_db), identity: Identity = Depends(require_operator)):
    inserted = seed_history(db)
    return {"inserted": inserted, "note": "Idempotent — no-op if history already exists."}


@router.post("/seed-signals", status_code=201)
def seed_signals(db: Session = Depends(get_db), identity: Identity = Depends(require_operator)):
    """Seed a Memorial Day demand-boost signal. Idempotent."""
    existing = db.scalar(select(ExternalSignal).limit(1))
    if existing:
        return {"inserted": 0, "note": "Signals already seeded."}

    now = datetime.now(timezone.utc)
    signal = ExternalSignal(
        id=f"sig_{uuid.uuid4().hex[:12]}",
        name="Memorial Day grilling demand boost",
        signal_type="holiday",
        multiplier=1.4,
        # Effective from 7 days ago through 7 days from now — guaranteed active for the demo
        effective_from=now.replace(hour=0, minute=0, second=0, microsecond=0)
        .replace(day=max(1, now.day - 7)),
        effective_until=now.replace(hour=23, minute=59, second=59, microsecond=0)
        .replace(day=min(28, now.day + 7)),
        category_pattern=None,
        sku_pattern=None,  # zone-wide for the demo
    )
    db.add(signal)
    db.commit()
    return {"inserted": 1, "note": "Memorial Day signal active for ±7 days."}


@router.post("/run", status_code=202)
def trigger_run(db: Session = Depends(get_db), identity: Identity = Depends(require_operator)):
    return run_pricing_engine(db)


@router.get("/recommendations")
def list_recommendations(
    db: Session = Depends(get_db),
    only_changes: bool = True,
    only_current: bool = True,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    scope: str | None = Query(
        None,
        description="Data scope: 'live' (user uploads only), 'demo' (seeded only), 'all'. Default all.",
    ),
):
    """List recommendations. By default returns the CURRENT (non-superseded)
    set — pass only_current=false to see the full history.

    The `scope` query parameter is the real Live/Demo backend boundary —
    when scope=live the result excludes recommendations whose source_run_id
    points at a demo seed.
    """
    resolved = current_scope(scope)
    stmt = select(PricingRecommendation).order_by(desc(PricingRecommendation.created_at))
    if only_changes:
        stmt = stmt.where(PricingRecommendation.recommended_price != PricingRecommendation.current_price)
    if only_current:
        stmt = stmt.where(PricingRecommendation.superseded_by.is_(None))
    stmt = apply_filter(stmt, PricingRecommendation.source_run_id, resolved)
    rows = list(db.scalars(stmt.offset(offset).limit(limit)))
    return {
        "total_returned": len(rows),
        "offset": offset,
        "limit": limit,
        "recommendations": [_rec_dict(r) for r in rows],
    }


@router.get("/recommendations/export.csv")
def export_recommendations_csv(
    db: Session = Depends(get_db),
    only_changes: bool = True,
):
    stmt = select(PricingRecommendation).where(
        PricingRecommendation.superseded_by.is_(None),
    ).order_by(desc(PricingRecommendation.created_at))
    if only_changes:
        stmt = stmt.where(PricingRecommendation.recommended_price != PricingRecommendation.current_price)

    def _stream():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "id", "sku", "store_id", "product_name",
                "current_price", "recommended_price", "change_pct",
                "expected_units_lift_pct", "expected_revenue_lift", "expected_profit_lift",
                "confidence", "elasticity_beta", "elasticity_beta_se",
                "elasticity_ci_low", "elasticity_ci_high",
                "elasticity_r2", "elasticity_n",
                "applied", "applied_to_scenario_id", "created_at",
            ],
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()
        for r in db.scalars(stmt):
            change_pct = (
                round((r.recommended_price - r.current_price) / r.current_price * 100, 2)
                if r.current_price else 0
            )
            w.writerow(
                [
                    r.id, r.sku, r.store_id, r.product_name,
                    r.current_price, r.recommended_price, change_pct,
                    r.expected_units_lift_pct, r.expected_revenue_lift, r.expected_profit_lift,
                    r.confidence, r.elasticity_beta or "", r.elasticity_beta_se or "",
                    r.elasticity_ci_low or "", r.elasticity_ci_high or "",
                    r.elasticity_r2 or "", r.elasticity_n or "",
                    r.applied, r.applied_to_scenario_id or "",
                    r.created_at.isoformat() if r.created_at else "",
                ],
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    filename = f"shelftrace-pricing-recs-{datetime.utcnow():%Y%m%d-%H%M%S}.csv"
    return StreamingResponse(
        _stream(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/recommendations/{rec_id}")
def get_recommendation(rec_id: str, db: Session = Depends(get_db)):
    row = db.scalar(select(PricingRecommendation).where(PricingRecommendation.id == rec_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return _rec_dict(row)


@router.post("/recommendations/{rec_id}/apply", status_code=201)
def apply_recommendation_to_shelftrace(
    rec_id: str,
    request: ApplyRecommendationRequest | None = None,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    """Convert a recommendation into a ShelfTrace scenario — closing the loop.

    The recommendation says "change price X → Y for SKU Z at store S".
    We create a single-action TestRunConfig with that price as the
    approved price, ready to run through canary → reconciliation →
    expansion. The recommendation row gets `applied=True` and a pointer
    to the created scenario so we can audit the link.
    """
    from app.models import TestRunConfig, TestRunAction, RunMode, Environment

    rec = db.scalar(select(PricingRecommendation).where(PricingRecommendation.id == rec_id))
    if rec is None:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    if rec.applied:
        raise HTTPException(status_code=409, detail="Already applied")
    if abs(rec.recommended_price - rec.current_price) < 0.005:
        raise HTTPException(
            status_code=422,
            detail="Recommendation is a no-change — nothing to apply.",
        )

    approval = request or ApplyRecommendationRequest()
    approved_by = approval.approved_by or identity.actor
    approval_record = {
        "source": "pricing_recommendation",
        "recommendation_id": rec.id,
        "approved_by": approved_by,
        "approval_policy": approval.approval_policy,
        "approval_note": approval.approval_note,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "pricing_snapshot": {
            "sku": rec.sku,
            "store_id": rec.store_id,
            "product_name": rec.product_name,
            "current_price": rec.current_price,
            "recommended_price": rec.recommended_price,
            "confidence": rec.confidence,
            "elasticity_beta": rec.elasticity_beta,
            "expected_revenue_lift": rec.expected_revenue_lift,
            "expected_profit_lift": rec.expected_profit_lift,
            "reasons": (rec.reasons_json or {}).get("reasons", []),
            "constraints": (rec.reasons_json or {}).get("constraints", []),
        },
    }
    source_hash = hashlib.sha256(
        json.dumps(approval_record, sort_keys=True).encode("utf-8")
    ).hexdigest()
    config_id = f"cfg_{uuid.uuid4().hex[:12]}"
    config = TestRunConfig(
        id=config_id,
        name=f"Pricing rec · {rec.product_name} · {rec.store_id}",
        run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION,
        zone_name="Pricing Engine Zone",
        store_ids_csv=rec.store_id,
        canary_store_ids_csv=rec.store_id,
        is_seeded=False,
        import_source_hash=source_hash,
        import_source_name=f"pricing_recommendation:{rec.id}",
        import_summary_json=approval_record,
        created_by=identity.actor,
    )
    db.add(config)
    db.add(
        TestRunAction(
            id=f"act_{uuid.uuid4().hex[:12]}",
            test_run_config_id=config_id,
            product_name=rec.product_name,
            sku=rec.sku,
            previous_price=rec.current_price,
            approved_price=rec.recommended_price,
            reason=f"Pricing engine recommendation · β={rec.elasticity_beta:.2f}"
            if rec.elasticity_beta else "Pricing engine recommendation",
            is_kvi=False,
            deadline_at=None,
        ),
    )
    rec.applied = True
    rec.applied_to_scenario_id = config_id
    db.commit()

    return {
        "recommendation_id": rec_id,
        "scenario_config_id": config_id,
        "approval": {
            "approved_by": approved_by,
            "approval_policy": approval.approval_policy,
            "source_hash": source_hash,
        },
        "next_step": f"/scenarios — load and execute scenario {config_id} to push this price through the canary → verification → expansion loop.",
    }


@router.get("/sku/{sku}/suggest")
def suggest_for_sku(
    sku: str,
    store_id: str | None = Query(None, description="Optional store filter; returns best rec across stores if omitted"),
    db: Session = Depends(get_db),
):
    """Get the latest non-superseded pricing recommendation for a SKU.

    Used by the Scenarios builder to show 'Pricing engine suggests $X.XX'
    next to each action — connecting the pricing brain to the canary loop.
    """
    stmt = (
        select(PricingRecommendation)
        .where(PricingRecommendation.sku == sku)
        .where(PricingRecommendation.superseded_by.is_(None))
        .order_by(desc(PricingRecommendation.created_at))
    )
    if store_id:
        stmt = stmt.where(PricingRecommendation.store_id == store_id)

    rec = db.scalar(stmt.limit(1))
    if rec is None:
        return {"sku": sku, "store_id": store_id, "recommendation": None}

    return {
        "sku": sku,
        "store_id": store_id,
        "recommendation": _rec_dict(rec),
    }


@router.get("/sku/{sku}/what-if-fit")
def get_what_if_fit(
    sku: str,
    store_id: str = Query(..., description="Required: store the what-if simulates against"),
    db: Session = Depends(get_db),
):
    """One-shot fetch of the inputs the client needs to run a live what-if
    price simulation against a SKU·store. Returns the fitted elasticity
    (so the client can predict units at any price), the constraint inputs
    (cost, competitor, KVI/perishable flags), and the observed price range
    so the UI can flag candidate prices outside the model's reliable zone.

    The frontend uses this to render an interactive slider with instant
    feedback — no per-keystroke API round-trip.
    """
    # Latest PriceAction = source of truth for the current/approved price
    action = db.scalar(
        select(PriceAction)
        .where(PriceAction.sku == sku)
        .where(PriceAction.store_id == store_id)
        .order_by(PriceAction.id.desc())
    )
    if action is None:
        raise HTTPException(
            status_code=404,
            detail=f"No price action found for {sku} at store {store_id}",
        )

    # Cost catalog (optional — engine produces a less-actionable result without it)
    cost_row = db.scalar(select(ProductCost).where(ProductCost.sku == sku))
    cost = cost_row.cost if cost_row else None

    # Historical sales → fit elasticity in-process
    history_rows = list(
        db.scalars(
            select(HistoricalSale)
            .where(HistoricalSale.sku == sku)
            .where(HistoricalSale.store_id == store_id)
            .order_by(HistoricalSale.date.asc())
        )
    )
    observations = [
        HistoricalObservation(
            date=row.date.date() if hasattr(row.date, "date") else row.date,
            price=row.price,
            units_sold=row.units_sold,
            on_promotion=row.on_promotion,
        )
        for row in history_rows
    ]
    fit = estimate_elasticity(observations, exclude_promotions=True)

    # Observed price range — used to widen confidence band outside this zone
    clean_prices = [obs.price for obs in observations if not obs.on_promotion]
    if clean_prices:
        observed_min = min(clean_prices)
        observed_max = max(clean_prices)
        observed_mean = sum(clean_prices) / len(clean_prices)
    else:
        observed_min = observed_max = observed_mean = action.approved_price

    # The exact (price, units) tuples the OLS regression saw — so the
    # client can render the same dots the fit consumed. Promotional rows
    # are flagged so the UI can dim them: they were excluded from β.
    observation_dots = [
        {
            "price": obs.price,
            "units": obs.units_sold,
            "on_promotion": obs.on_promotion,
        }
        for obs in observations
        if obs.price > 0 and obs.units_sold > 0
    ]

    # Competitor reference via the knowledge graph (most recent observation in zone)
    entity = product_graph.get_entity_for_sku(db, sku)
    competitor_price: float | None = None
    competitor_source: str | None = None
    if entity:
        observations_for_entity = product_graph.get_competitor_prices_for_entity(db, entity.id)
        if observations_for_entity:
            latest = max(observations_for_entity, key=lambda o: o.observed_at)
            competitor_price = latest.price
            # cp_<id> → source lookup
            from app.models import CompetitorProduct
            cp = db.scalar(
                select(CompetitorProduct).where(CompetitorProduct.id == latest.competitor_product_id)
            )
            competitor_source = cp.source_id if cp else None

    # Days to deadline (perishable only)
    from datetime import datetime, timezone
    days_to_deadline: int | None = None
    if action.markdown_deadline is not None:
        now = datetime.now(timezone.utc)
        deadline = action.markdown_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        days_to_deadline = (deadline - now).days

    return {
        "sku": sku,
        "store_id": store_id,
        "product_name": action.product_name,
        "current_price": action.approved_price,
        "prior_price": action.prior_price,
        "cost": cost,
        "competitor_price": competitor_price,
        "competitor_source": competitor_source,
        "is_kvi": action.is_kvi,
        "is_perishable": action.is_perishable,
        "days_to_deadline": days_to_deadline,
        "elasticity": {
            "beta": fit.beta,
            "intercept": fit.intercept,
            "beta_se": fit.beta_se,
            "beta_ci_low": fit.beta_ci_low,
            "beta_ci_high": fit.beta_ci_high,
            "r_squared": fit.r_squared,
            "n_observations": fit.n_observations,
            "sufficient_data": fit.sufficient_data,
            "is_elastic": fit.is_elastic,
            "is_inelastic": fit.is_inelastic,
            "is_statistically_significant": fit.is_statistically_significant,
            "notes": fit.notes,
        },
        "observed_price_range": {
            "min": observed_min,
            "max": observed_max,
            "mean": observed_mean,
        },
        "observations": observation_dots,
    }


# Per-policy gross-margin targets. KVI runs tight (competes on price image,
# subsidized by basket); perishables need a spoilage buffer baked in; the
# rest aims at a healthy default. These are policy choices the chain
# encodes — mirrors CATEGORY_MARGIN_FLOORS but expresses the *aim* rather
# than the absolute floor.
MARGIN_TARGETS_BY_POLICY: dict[str, float] = {
    "kvi": 0.10,         # 10% — beat-the-competitor lane
    "perishable": 0.25,  # 25% — covers expected shrink
    "standard": 0.30,    # 30% — healthy baseline
}

MARGIN_TARGET_DEFAULTS = {
    "near_band_pp": 3.0,    # within 3 percentage points = "near"
    "at_band_pp": 1.0,      # within 1pp = "at"
}


@router.get("/margin-targets")
def margin_targets(
    db: Session = Depends(get_db),
    scope: str | None = Query(
        None,
        description="Data scope: 'live' (user uploads only), 'demo' (seeded only), 'all'. Default all.",
    ),
) -> dict:
    """Category-level margin rollup vs targets.

    Classifies every latest PriceAction into one of three policy buckets —
    `kvi`, `perishable`, `standard` — and computes a weighted-average gross
    margin within each bucket. When historical sales exist for a SKU·store
    we weight by revenue (price × units); otherwise we fall back to weight
    by approved_price (a usable proxy for basket contribution).

    The portfolio rollup blends the buckets weighted by their estimated
    revenue. Status is one of `above`/`at`/`near`/`below` based on the
    distance to target in percentage points.

    PriceAction itself has no source_run_id (it inherits from its parent
    batch); the scope filter therefore joins price_batches and applies
    `apply_filter(PriceBatch.source_run_id, ...)`.
    """
    resolved = current_scope(scope)
    # Latest PriceAction per (sku, store) — same dedup as kvi-watchlist
    action_stmt = (
        select(PriceAction)
        .join(PriceBatch, PriceAction.batch_id == PriceBatch.id)
        .order_by(PriceAction.id.desc())
    )
    action_stmt = apply_filter(action_stmt, PriceBatch.source_run_id, resolved)
    actions = list(db.scalars(action_stmt))
    latest: dict[tuple[str, str], PriceAction] = {}
    for a in actions:
        key = (a.sku, a.store_id)
        if key not in latest:
            latest[key] = a

    if not latest:
        return _empty_margin_payload()

    # Cost catalog
    costs = {c.sku: c.cost for c in db.scalars(select(ProductCost))}

    # Revenue weights from history (last 30 obs per sku·store gives a fair
    # contemporary signal without going stale). Fallback to price-based
    # weighting when no history exists.
    revenue_weight: dict[tuple[str, str], float] = {}
    history_rows = list(
        db.scalars(select(HistoricalSale).order_by(HistoricalSale.date.desc()))
    )
    by_key: dict[tuple[str, str], list[HistoricalSale]] = {}
    for h in history_rows:
        by_key.setdefault((h.sku, h.store_id), []).append(h)
    for key, hs in by_key.items():
        sample = hs[:30]
        revenue_weight[key] = sum(h.price * h.units_sold for h in sample)

    # Bucket each action
    buckets: dict[str, dict] = {
        policy: {
            "policy": policy,
            "target_pct": MARGIN_TARGETS_BY_POLICY[policy],
            "weighted_margin_sum": 0.0,
            "weight_sum": 0.0,
            "n_skus": 0,
            "n_with_cost": 0,
            "revenue_estimate": 0.0,
        }
        for policy in MARGIN_TARGETS_BY_POLICY
    }

    for (_sku, _store), action in latest.items():
        if action.is_kvi:
            policy = "kvi"
        elif action.is_perishable:
            policy = "perishable"
        else:
            policy = "standard"

        bucket = buckets[policy]
        bucket["n_skus"] += 1

        cost = costs.get(action.sku)
        if cost is None or cost <= 0 or action.approved_price <= 0:
            # Counts toward SKU population but not margin math
            continue

        bucket["n_with_cost"] += 1
        margin_pct = (action.approved_price - cost) / action.approved_price
        weight = revenue_weight.get((action.sku, action.store_id)) or action.approved_price
        bucket["weighted_margin_sum"] += margin_pct * weight
        bucket["weight_sum"] += weight
        bucket["revenue_estimate"] += weight

    # Finalize per-bucket rollup
    near_pp = MARGIN_TARGET_DEFAULTS["near_band_pp"] / 100
    at_pp = MARGIN_TARGET_DEFAULTS["at_band_pp"] / 100

    def _status(gap: float) -> str:
        if gap >= 0:
            return "above" if gap > at_pp else "at"
        ag = abs(gap)
        if ag <= at_pp:
            return "at"
        if ag <= near_pp:
            return "near"
        return "below"

    categories: list[dict] = []
    portfolio_weighted_sum = 0.0
    portfolio_weight = 0.0
    portfolio_revenue = 0.0
    total_skus = 0
    for policy, b in buckets.items():
        current_pct = (b["weighted_margin_sum"] / b["weight_sum"]) if b["weight_sum"] > 0 else None
        gap_pct = (current_pct - b["target_pct"]) if current_pct is not None else None
        status = _status(gap_pct) if gap_pct is not None else "no_data"

        categories.append({
            "policy": policy,
            "label": _policy_label(policy),
            "target_pct": b["target_pct"],
            "current_pct": current_pct,
            "gap_pct": gap_pct,
            "n_skus": b["n_skus"],
            "n_with_cost": b["n_with_cost"],
            "revenue_estimate": round(b["revenue_estimate"], 2),
            "status": status,
        })

        if current_pct is not None and b["weight_sum"] > 0:
            portfolio_weighted_sum += b["weighted_margin_sum"]
            portfolio_weight += b["weight_sum"]
            portfolio_revenue += b["revenue_estimate"]
        total_skus += b["n_skus"]

    # Sort: below-target first (most urgent), then near, then at/above
    status_rank = {"below": 0, "near": 1, "at": 2, "above": 3, "no_data": 4}
    categories.sort(key=lambda c: (status_rank.get(c["status"], 99), c["policy"]))

    # Portfolio target = revenue-weighted blend of category targets
    portfolio_target = 0.0
    if portfolio_revenue > 0:
        portfolio_target = sum(
            (c["revenue_estimate"] / portfolio_revenue) * c["target_pct"]
            for c in categories
            if c["current_pct"] is not None
        )

    portfolio_current = (portfolio_weighted_sum / portfolio_weight) if portfolio_weight > 0 else None
    portfolio_gap = (
        portfolio_current - portfolio_target
        if portfolio_current is not None and portfolio_target > 0
        else None
    )

    return {
        "categories": categories,
        "portfolio": {
            "target_pct": portfolio_target if portfolio_target > 0 else None,
            "current_pct": portfolio_current,
            "gap_pct": portfolio_gap,
            "n_skus": total_skus,
            "revenue_estimate": round(portfolio_revenue, 2),
            "status": _status(portfolio_gap) if portfolio_gap is not None else "no_data",
        },
        "bands": {
            "at_pp": MARGIN_TARGET_DEFAULTS["at_band_pp"],
            "near_pp": MARGIN_TARGET_DEFAULTS["near_band_pp"],
        },
    }


def _policy_label(policy: str) -> str:
    return {
        "kvi": "KVI traffic-drivers",
        "perishable": "Perishables",
        "standard": "Standard catalog",
    }.get(policy, policy.title())


def _empty_margin_payload() -> dict:
    return {
        "categories": [
            {
                "policy": p,
                "label": _policy_label(p),
                "target_pct": MARGIN_TARGETS_BY_POLICY[p],
                "current_pct": None,
                "gap_pct": None,
                "n_skus": 0,
                "n_with_cost": 0,
                "revenue_estimate": 0.0,
                "status": "no_data",
            }
            for p in MARGIN_TARGETS_BY_POLICY
        ],
        "portfolio": {
            "target_pct": None,
            "current_pct": None,
            "gap_pct": None,
            "n_skus": 0,
            "revenue_estimate": 0.0,
            "status": "no_data",
        },
        "bands": {
            "at_pp": MARGIN_TARGET_DEFAULTS["at_band_pp"],
            "near_pp": MARGIN_TARGET_DEFAULTS["near_band_pp"],
        },
    }


@router.get("/kvi-watchlist")
def kvi_watchlist(
    db: Session = Depends(get_db),
    scope: str | None = Query(
        None,
        description="Data scope: 'live' (user uploads only), 'demo' (seeded only), 'all'. Default all.",
    ),
) -> dict:
    """Every KVI-flagged price action with its competitor reference and gap.

    KVI = Key Value Item. Retailers fight for shopper loyalty on a handful
    of traffic-driver SKUs (eggs, milk, OJ, hot dogs) where price perception
    matters more than per-unit margin. Surfacing them as a dedicated panel
    makes that strategic lens explicit instead of buried as a per-row flag.

    For each KVI action we return:
      • current approved price (truth from the latest PriceAction)
      • competitor reference + source (most recent observation via the
        product graph)
      • absolute and signed gap vs the competitor
      • a tolerance band breach flag (anything outside ±1.5% trips the lock)
      • the latest non-superseded recommendation, if one exists, so the
        watchlist can dual-purpose as a triage queue

    Sorted by absolute gap descending — the SKUs furthest off-strategy
    bubble to the top. Scope filter joins via parent batch.
    """
    KVI_TOLERANCE_PCT = 1.5  # mirrors KVI_COMPETITOR_TOLERANCE in pipeline
    resolved = current_scope(scope)

    # Latest KVI PriceAction per (sku, store), scoped via parent batch
    action_stmt = (
        select(PriceAction)
        .join(PriceBatch, PriceAction.batch_id == PriceBatch.id)
        .where(PriceAction.is_kvi == True)  # noqa: E712
        .order_by(PriceAction.id.desc())
    )
    action_stmt = apply_filter(action_stmt, PriceBatch.source_run_id, resolved)
    actions = list(db.scalars(action_stmt))

    # Dedup to latest per (sku, store)
    latest: dict[tuple[str, str], PriceAction] = {}
    for a in actions:
        key = (a.sku, a.store_id)
        if key not in latest:
            latest[key] = a

    if not latest:
        return {
            "tolerance_pct": KVI_TOLERANCE_PCT,
            "items": [],
            "summary": {
                "total": 0,
                "within_band": 0,
                "above_band": 0,
                "below_band": 0,
                "max_abs_gap_pct": 0.0,
            },
        }

    # Latest non-superseded rec per (sku, store)
    rec_rows = list(
        db.scalars(
            select(PricingRecommendation)
            .where(PricingRecommendation.superseded_by.is_(None))
            .order_by(desc(PricingRecommendation.created_at))
        )
    )
    rec_by_key: dict[tuple[str, str], PricingRecommendation] = {}
    for r in rec_rows:
        key = (r.sku, r.store_id)
        if key not in rec_by_key:
            rec_by_key[key] = r

    items: list[dict] = []
    for (sku, store_id), action in latest.items():
        entity = product_graph.get_entity_for_sku(db, sku)
        competitor_price: float | None = None
        competitor_source: str | None = None
        if entity:
            observations = product_graph.get_competitor_prices_for_entity(db, entity.id)
            if observations:
                latest_obs = max(observations, key=lambda o: o.observed_at)
                competitor_price = latest_obs.price
                from app.models import CompetitorProduct
                cp = db.scalar(
                    select(CompetitorProduct).where(CompetitorProduct.id == latest_obs.competitor_product_id)
                )
                competitor_source = cp.source_id if cp else None

        gap_dollar: float | None = None
        gap_pct: float | None = None
        band: str = "no_competitor"
        if competitor_price and competitor_price > 0:
            gap_dollar = round(action.approved_price - competitor_price, 4)
            gap_pct = round((action.approved_price - competitor_price) / competitor_price * 100, 2)
            if abs(gap_pct) <= KVI_TOLERANCE_PCT:
                band = "within"
            elif gap_pct > 0:
                band = "above"
            else:
                band = "below"

        rec = rec_by_key.get((sku, store_id))
        rec_block: dict | None = None
        if rec is not None and abs(rec.recommended_price - rec.current_price) >= 0.005:
            rec_block = {
                "id": rec.id,
                "recommended_price": rec.recommended_price,
                "change_pct": round(
                    (rec.recommended_price - rec.current_price) / rec.current_price * 100, 2
                ) if rec.current_price else 0,
                "applied": rec.applied,
                "applied_to_scenario_id": rec.applied_to_scenario_id,
            }

        items.append({
            "sku": sku,
            "store_id": store_id,
            "product_name": action.product_name,
            "current_price": action.approved_price,
            "prior_price": action.prior_price,
            "competitor_price": competitor_price,
            "competitor_source": competitor_source,
            "gap_dollar": gap_dollar,
            "gap_pct": gap_pct,
            "abs_gap_pct": abs(gap_pct) if gap_pct is not None else None,
            "band": band,
            "recommendation": rec_block,
        })

    # Sort by absolute gap descending. Items with no competitor reference
    # sink to the bottom, since we have nothing to act on.
    items.sort(
        key=lambda it: (
            it["abs_gap_pct"] is None,
            -(it["abs_gap_pct"] or 0.0),
            it["sku"],
        )
    )

    within = sum(1 for it in items if it["band"] == "within")
    above = sum(1 for it in items if it["band"] == "above")
    below = sum(1 for it in items if it["band"] == "below")
    max_abs = max((it["abs_gap_pct"] or 0.0) for it in items) if items else 0.0

    return {
        "tolerance_pct": KVI_TOLERANCE_PCT,
        "items": items,
        "summary": {
            "total": len(items),
            "within_band": within,
            "above_band": above,
            "below_band": below,
            "max_abs_gap_pct": round(max_abs, 2),
        },
    }


@router.get("/sku/{sku}/history")
def sku_history(
    sku: str,
    db: Session = Depends(get_db),
    store_id: str | None = None,
    limit: int = Query(120, ge=1, le=500),
):
    stmt = select(HistoricalSale).where(HistoricalSale.sku == sku).order_by(HistoricalSale.date.asc())
    if store_id:
        stmt = stmt.where(HistoricalSale.store_id == store_id)
    rows = list(db.scalars(stmt.limit(limit)))
    return {
        "sku": sku,
        "observations": [
            {
                "date": r.date,
                "store_id": r.store_id,
                "price": r.price,
                "units_sold": r.units_sold,
                "on_promotion": r.on_promotion,
            }
            for r in rows
        ],
    }


@router.get("/costs")
def list_costs(db: Session = Depends(get_db)):
    rows = list(db.scalars(select(ProductCost).order_by(ProductCost.sku)))
    return {
        "costs": [
            {"sku": r.sku, "cost": r.cost, "effective_from": r.effective_from}
            for r in rows
        ],
    }


@router.get("/signals")
def list_signals(db: Session = Depends(get_db)):
    rows = list(db.scalars(select(ExternalSignal).order_by(ExternalSignal.effective_from.desc())))
    now = datetime.now(timezone.utc)
    return {
        "signals": [
            {
                "id": s.id,
                "name": s.name,
                "signal_type": s.signal_type,
                "multiplier": s.multiplier,
                "effective_from": s.effective_from,
                "effective_until": s.effective_until,
                "category_pattern": s.category_pattern,
                "sku_pattern": s.sku_pattern,
                "is_active": s.effective_from <= now <= s.effective_until,
            }
            for s in rows
        ],
    }


def _rec_dict(r: PricingRecommendation) -> dict:
    return {
        "id": r.id,
        "sku": r.sku,
        "store_id": r.store_id,
        "product_name": r.product_name,
        "current_price": r.current_price,
        "recommended_price": r.recommended_price,
        "change_pct": round(
            (r.recommended_price - r.current_price) / r.current_price * 100, 2
        ) if r.current_price else 0,
        "expected_units_lift_pct": r.expected_units_lift_pct,
        "expected_revenue_lift": r.expected_revenue_lift,
        "expected_profit_lift": r.expected_profit_lift,
        "confidence": r.confidence,
        "elasticity_beta": r.elasticity_beta,
        "elasticity_beta_se": r.elasticity_beta_se,
        "elasticity_ci_low": r.elasticity_ci_low,
        "elasticity_ci_high": r.elasticity_ci_high,
        "elasticity_r2": r.elasticity_r2,
        "elasticity_n": r.elasticity_n,
        "reasons": (r.reasons_json or {}).get("reasons", []),
        "applied_constraints": (r.reasons_json or {}).get("constraints", []),
        "matched_signals": (r.reasons_json or {}).get("matched_signals", []),
        "demand_multiplier": (r.reasons_json or {}).get("demand_multiplier", 1.0),
        "applied": r.applied,
        "applied_to_scenario_id": r.applied_to_scenario_id,
        "superseded_by": r.superseded_by,
        "created_at": r.created_at,
    }
