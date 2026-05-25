"""Pricing engine API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import HistoricalSale, PricingRecommendation, ProductCost
from app.pricing.pipeline import run_pricing_engine
from app.pricing.seed import seed_history
from app.security import Identity, require_operator

router = APIRouter(prefix="/api/v1/pricing", tags=["pricing"])


@router.post("/seed-history", status_code=201)
def seed(db: Session = Depends(get_db), identity: Identity = Depends(require_operator)):
    """Seed 90 days of synthetic sales history for the demo SKUs.

    Idempotent — returns 0 inserted if data already exists.
    """
    inserted = seed_history(db)
    return {"inserted": inserted, "note": "Idempotent — no-op if history already exists."}


@router.post("/run", status_code=202)
def trigger_run(db: Session = Depends(get_db), identity: Identity = Depends(require_operator)):
    """Run the engine — recompute recommendations for every SKU·store."""
    summary = run_pricing_engine(db)
    return summary


@router.get("/recommendations")
def list_recommendations(
    db: Session = Depends(get_db),
    only_changes: bool = True,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = select(PricingRecommendation).order_by(desc(PricingRecommendation.created_at))
    if only_changes:
        # Cheap filter: only show rows where recommended differs from current
        stmt = stmt.where(PricingRecommendation.recommended_price != PricingRecommendation.current_price)
    rows = list(db.scalars(stmt.offset(offset).limit(limit)))
    return {
        "total_returned": len(rows),
        "offset": offset,
        "limit": limit,
        "recommendations": [
            {
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
                "elasticity_r2": r.elasticity_r2,
                "elasticity_n": r.elasticity_n,
                "reasons": (r.reasons_json or {}).get("reasons", []),
                "applied_constraints": (r.reasons_json or {}).get("constraints", []),
                "applied": r.applied,
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }


@router.get("/recommendations/{rec_id}")
def get_recommendation(rec_id: str, db: Session = Depends(get_db)):
    row = db.scalar(select(PricingRecommendation).where(PricingRecommendation.id == rec_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return {
        "id": row.id,
        "sku": row.sku,
        "store_id": row.store_id,
        "product_name": row.product_name,
        "current_price": row.current_price,
        "recommended_price": row.recommended_price,
        "expected_units_lift_pct": row.expected_units_lift_pct,
        "expected_revenue_lift": row.expected_revenue_lift,
        "expected_profit_lift": row.expected_profit_lift,
        "confidence": row.confidence,
        "elasticity_beta": row.elasticity_beta,
        "elasticity_r2": row.elasticity_r2,
        "elasticity_n": row.elasticity_n,
        "reasons": (row.reasons_json or {}).get("reasons", []),
        "applied_constraints": (row.reasons_json or {}).get("constraints", []),
        "applied": row.applied,
        "created_at": row.created_at,
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
