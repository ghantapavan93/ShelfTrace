"""Pricing engine API."""
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ExternalSignal,
    HistoricalSale,
    PricingRecommendation,
    ProductCost,
)
from app.pricing.pipeline import run_pricing_engine
from app.pricing.seed import seed_history
from app.security import Identity, require_operator

router = APIRouter(prefix="/api/v1/pricing", tags=["pricing"])


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
):
    """List recommendations. By default returns the CURRENT (non-superseded)
    set — pass only_current=false to see the full history."""
    stmt = select(PricingRecommendation).order_by(desc(PricingRecommendation.created_at))
    if only_changes:
        stmt = stmt.where(PricingRecommendation.recommended_price != PricingRecommendation.current_price)
    if only_current:
        stmt = stmt.where(PricingRecommendation.superseded_by.is_(None))
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
