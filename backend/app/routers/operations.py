from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import PriceAction, PriceBatch, RunMode
from app.routers.common import get_batch_or_404
from app.schemas import OperationsOverview
from app.services import queries

router = APIRouter(prefix="/api/v1", tags=["operations"])


@router.get("/mode")
def get_mode():
    """Return the platform's runtime mode so the UI can show a clear banner.

    DEMO MODE: simulated retailers, no real ESL/POS/ecommerce connections.
              Memorial Day data auto-seeded. Safe to click anything.
    LIVE MODE: real retailer connectors wired (production deployment).

    Today the prototype is always demo_mode=True. The flag drives the banner
    so reviewers immediately understand what they're looking at.
    """
    if settings.demo_mode:
        return {
            "mode": "demo",
            "label": "DEMO MODE",
            "tone": "violet",
            "description": "Simulated retailer connectors. No real POS, ESL, or ecommerce systems are contacted.",
            "details": "Memorial Day Dallas Zone 2 batch is auto-seeded. All scenarios run against a deterministic simulator with configurable behaviors. Safe to click anything.",
        }
    return {
        "mode": "live",
        "label": "LIVE MODE",
        "tone": "rose",
        "description": "Real retailer connectors active. Actions affect production systems.",
        "details": "Every executed scenario will send real price updates to wired connectors. Verify approvals before running.",
    }


@router.get("/system-status")
def system_status(db: Session = Depends(get_db)):
    """Global rollout health, derived from the latest live-rollout batch state."""
    batch = db.scalar(
        select(PriceBatch)
        .where(PriceBatch.run_mode == RunMode.LIVE_ROLLOUT)
        .order_by(PriceBatch.created_at.desc())
    )
    if batch is None:
        return {"label": "No active rollout", "tone": "neutral", "status": None}
    status = batch.status.value
    if status in ("blocked", "partially_blocked", "canary_verifying"):
        return {"label": "Rollout intervention required", "tone": "danger", "status": status}
    if status in ("ready_for_expansion", "expanding"):
        return {"label": "Ready to expand", "tone": "warn", "status": status}
    if status == "completed":
        return {"label": "All systems verified", "tone": "verified", "status": status}
    return {"label": "Rollout in progress", "tone": "warn", "status": status}


@router.get("/operations", response_model=OperationsOverview)
def operations(external_id: str | None = None, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, external_id)
    return queries.operations_overview(db, batch)


@router.get("/markdowns")
def markdowns(external_id: str | None = None, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, external_id)
    canary = set(next((g.store_ids for g in batch.rollout_groups if g.kind == "canary"), []))
    rows = [
        a for a in batch.actions if a.is_perishable and a.markdown_deadline and a.store_id in canary
    ]
    out = []
    for a in sorted(rows, key=lambda x: x.store_id):
        out.append(
            {
                "action": queries.action_view(a).model_dump(),
                "markdown_deadline": a.markdown_deadline,
            }
        )
    return {"zone": batch.zone, "markdowns": out}
