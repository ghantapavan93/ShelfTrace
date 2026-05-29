from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import PriceAction, PriceBatch, RunMode
from app.routers.common import get_batch_or_404
from app.schemas import OperationsOverview
from app.scope import Scope, apply_filter, current_scope
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
def operations(
    external_id: str | None = None,
    scope: str | None = Query(
        None,
        description="Data scope: 'live' (user uploads only), 'demo' (seeded only), 'all'. "
        "Applied only when external_id is omitted — explicit URL lookups remain the "
        "documented escape hatch and bypass the filter.",
    ),
    db: Session = Depends(get_db),
):
    if external_id:
        # Explicit URL → honor the escape hatch contract. A Live-mode user
        # who navigates directly to the demo batch by id still gets it
        # (the UI then renders the "Demo batch · Live mode" chip).
        batch = get_batch_or_404(db, external_id)
    else:
        # Implicit default → pick the latest batch that matches the scope
        # filter. Without this, Live mode users with no live batches yet
        # would fall through to the seeded Memorial Day demo.
        resolved = current_scope(scope)
        stmt = (
            select(PriceBatch)
            .where(PriceBatch.run_mode == RunMode.LIVE_ROLLOUT)
            .order_by(PriceBatch.created_at.desc())
        )
        stmt = apply_filter(stmt, PriceBatch.source_run_id, resolved)
        batch = db.scalar(stmt)
        if batch is None:
            # No batch in the requested scope. The fallback depends on the
            # scope contract:
            #   • Scope.ALL  → reviewer asked for "anything"; fall back to the
            #     unfiltered latest so the page still renders something.
            #   • Scope.LIVE / Scope.DEMO → caller asked for a SPECIFIC half of
            #     the boundary. Returning the OTHER half would be a silent
            #     contract violation (Live mode rendering the seeded Memorial
            #     Day batch). Raise 404 — the frontend's clean-slate banner
            #     renders the friendly empty state for a 404 here.
            if resolved == Scope.ALL:
                batch = get_batch_or_404(db, None)
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"No batch found in scope '{resolved.value}'",
                )
    return queries.operations_overview(db, batch)


@router.get("/markdowns")
def markdowns(
    external_id: str | None = None,
    scope: str | None = Query(
        None,
        description="Data scope: 'live' (user uploads only), 'demo' (seeded only), 'all'. "
        "Applied only when external_id is omitted. With scope=live and no live batch, "
        "an empty SLA payload is returned (not 404) so the UI shows a clean empty state.",
    ),
    db: Session = Depends(get_db),
):
    """Perishable-markdown reliability SLA for the batch in the requested scope.

    SLA semantics: every perishable markdown's shelf label (ESL) must
    acknowledge the approved markdown before its sell-through deadline. The
    response carries per-item SLA status plus an aggregate compliance summary
    (see ``queries.markdown_sla``).
    """
    if external_id:
        # Explicit URL → escape hatch (a Live-mode user can still inspect the
        # seeded demo batch's markdowns by id).
        batch = get_batch_or_404(db, external_id)
    else:
        resolved = current_scope(scope)
        stmt = (
            select(PriceBatch)
            .where(PriceBatch.run_mode == RunMode.LIVE_ROLLOUT)
            .order_by(PriceBatch.created_at.desc())
        )
        stmt = apply_filter(stmt, PriceBatch.source_run_id, resolved)
        batch = db.scalar(stmt)
        if batch is None:
            if resolved == Scope.ALL:
                batch = get_batch_or_404(db, None)
            else:
                return queries.empty_markdown_sla()
    return queries.markdown_sla(db, batch)
