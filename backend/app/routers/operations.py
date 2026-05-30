from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    ActionDecision,
    Incident,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
    RunMode,
)
from app.routers.common import get_batch_or_404
from app.schemas import ExplainRequest, ExplainResponse, OperationsOverview
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


@router.post("/operations/explain", response_model=ExplainResponse)
def explain(
    body: ExplainRequest,
    scope: str | None = Query(
        None,
        description="Data scope: 'live', 'demo', 'all'. Mirrors /operations so "
        "Ask ShelfTrace does not surface the seeded demo batch in Live mode.",
    ),
    db: Session = Depends(get_db),
):
    """Deterministic, template-driven explanation of current batch/zone state.

    NOT AI-generated. Every sentence is assembled from real DB rows — incidents,
    actions, channel receipts. The ``query`` string is used only for keyword
    routing to select the correct template branch.
    """
    q = body.query.lower()

    # ------------------------------------------------------------------ #
    # 1. Find the most recent LIVE_ROLLOUT batch that has open incidents  #
    #    (i.e. the batch that is currently blocked or under intervention). #
    #    Fall back to the latest LIVE_ROLLOUT batch if nothing is open.   #
    # ------------------------------------------------------------------ #
    # Scope-filter the batch pick exactly like /operations so Ask ShelfTrace
    # never surfaces the seeded demo batch when the caller is in Live mode.
    resolved = current_scope(scope)
    stmt = (
        select(PriceBatch)
        .where(PriceBatch.run_mode == RunMode.LIVE_ROLLOUT)
        .order_by(PriceBatch.created_at.desc())
    )
    stmt = apply_filter(stmt, PriceBatch.source_run_id, resolved)
    batch = db.scalar(stmt)

    if batch is None:
        return ExplainResponse(
            answer="No active rollout batch found. ShelfTrace has not yet received a price batch in live-rollout mode.",
            evidence_chips=[],
            zone_status={},
            measurement_gate="PENDING",
        )

    # ------------------------------------------------------------------ #
    # 2. Collect open incidents for this batch                            #
    # ------------------------------------------------------------------ #
    open_statuses = [IncidentStatus.OPEN, IncidentStatus.RETRYING]

    open_incidents: list[Incident] = list(
        db.scalars(
            select(Incident)
            .where(
                Incident.batch_id == batch.id,
                Incident.status.in_(open_statuses),
            )
            .order_by(Incident.created_at.desc())
        )
    )

    # ------------------------------------------------------------------ #
    # Branch A — "block" / "hold" / "zone" / "why" / "status" keywords   #
    # ------------------------------------------------------------------ #
    _block_keywords = ("block", "hold", "zone", "why", "status", "intervention", "halt", "expand")
    if any(kw in q for kw in _block_keywords):
        # Find the most relevant critical/open incident to explain
        critical_incident: Incident | None = next(
            (i for i in open_incidents if i.severity == IncidentSeverity.CRITICAL),
            None,
        )
        incident = critical_incident or (open_incidents[0] if open_incidents else None)

        if incident is None:
            # Batch exists but no open incidents — clean state
            return ExplainResponse(
                answer=(
                    f'Batch "{batch.external_id}" ({batch.zone}) has no open incidents. '
                    "All canary stores verified the approved price and expansion is not blocked."
                ),
                evidence_chips=["Approved Action", "Canary Verification", "Measurement Gate"],
                zone_status={sid: "Verified" for sid in queries._canary_ids(batch)},
                measurement_gate="ELIGIBLE",
            )

        # Pull the action for that incident
        action: PriceAction | None = db.get(PriceAction, incident.action_id)
        product = action.product_name if action else "Unknown product"
        approved_price = f"${action.approved_price:.2f}" if action else "an approved price"
        store_id = action.store_id if action else incident.action_id

        # Build channel evidence sentence
        channel_name = incident.offending_channel.value.upper() if incident.offending_channel else "a channel"

        if incident.type == IncidentType.PRICE_MISMATCH:
            consequence = (
                "Expansion to remaining stores is held until the mismatch is resolved "
                "and all required channels acknowledge the correct price."
            )
            answer = (
                f"{product} was approved at {approved_price}. "
                f"{channel_name} returned a price that does not match the approved value on store {store_id}. "
                f"{consequence}"
            )
            measurement_gate = "QUARANTINED"
        elif incident.type == IncidentType.CHANNEL_TIMEOUT:
            consequence = (
                "The action is quarantined from measurement until the channel acknowledges "
                "or the retry window expires."
            )
            answer = (
                f"{product} was approved at {approved_price}. "
                f"{channel_name} did not respond within the acknowledgement window on store {store_id}. "
                f"{consequence}"
            )
            measurement_gate = "QUARANTINED"
        else:
            # DEADLINE_RISK or unknown
            answer = (
                f'{product} has an open incident of type "{incident.type.value}" on store {store_id}. '
                f"{incident.summary}"
            )
            measurement_gate = "QUARANTINED"

        # Build zone_status: canary stores with mismatch → intervention required;
        # expansion stores → expansion held; all others → pending.
        zone_status: dict[str, str] = {}
        for sid in queries._canary_ids(batch):
            if sid == store_id:
                zone_status[sid] = "Intervention required"
            else:
                zone_status[sid] = "Canary verified"
        for sid in queries._expansion_ids(batch):
            zone_status[sid] = "Expansion held"

        return ExplainResponse(
            answer=answer,
            evidence_chips=[
                "Approved Action",
                "POS Receipt",
                "Protected Stores",
                "Measurement Gate",
                "Incident Log",
            ],
            zone_status=zone_status,
            measurement_gate=measurement_gate,
        )

    # ------------------------------------------------------------------ #
    # Branch B — strawberry / ESL / deadline keywords                     #
    # ------------------------------------------------------------------ #
    _perishable_keywords = ("strawberr", "esl", "deadline", "perishable", "markdown", "sell-through", "sellthrough")
    if any(kw in q for kw in _perishable_keywords):
        deadline_incident: Incident | None = db.scalar(
            select(Incident)
            .where(
                Incident.batch_id == batch.id,
                Incident.type == IncidentType.DEADLINE_RISK,
                Incident.status.in_(open_statuses),
            )
            .order_by(Incident.created_at.desc())
        )

        if deadline_incident is None:
            # No active deadline risk — check for any perishable action
            perishable_action: PriceAction | None = db.scalar(
                select(PriceAction)
                .where(
                    PriceAction.batch_id == batch.id,
                    PriceAction.is_perishable.is_(True),
                )
            )
            if perishable_action:
                return ExplainResponse(
                    answer=(
                        f"{perishable_action.product_name} markdown to "
                        f"${perishable_action.approved_price:.2f} on store "
                        f"{perishable_action.store_id} has no active deadline risk. "
                        f"ESL acknowledged and sell-through measurement is eligible."
                    ),
                    evidence_chips=["Approved Action", "ESL Receipt", "Measurement Gate"],
                    zone_status={perishable_action.store_id: "ESL verified"},
                    measurement_gate="ELIGIBLE",
                )
            return ExplainResponse(
                answer="No perishable deadline risk incidents are currently open for this batch.",
                evidence_chips=["Incident Log"],
                zone_status={},
                measurement_gate="PENDING",
            )

        dl_action: PriceAction | None = db.get(PriceAction, deadline_incident.action_id)
        product = dl_action.product_name if dl_action else "Perishable item"
        approved_price = f"${dl_action.approved_price:.2f}" if dl_action else "the approved price"
        store_id = dl_action.store_id if dl_action else "unknown store"

        answer = (
            f"{product} markdown to {approved_price} is pending ESL acknowledgement on store {store_id}. "
            f"Sell-through measurement is quarantined until shelf visibility is verified."
        )
        return ExplainResponse(
            answer=answer,
            evidence_chips=["Approved Action", "ESL Receipt", "Deadline Risk", "Measurement Gate"],
            zone_status={store_id: "ESL pending"},
            measurement_gate="QUARANTINED",
        )

    # ------------------------------------------------------------------ #
    # Branch C — default fallback: general batch status summary           #
    # ------------------------------------------------------------------ #
    total = len(batch.actions) if batch.actions else 0
    verified = sum(1 for a in batch.actions if a.decision == ActionDecision.ELIGIBLE) if batch.actions else 0
    blocked = sum(1 for a in batch.actions if a.decision == ActionDecision.BLOCKED) if batch.actions else 0
    open_count = len(open_incidents)

    answer = (
        f'Batch "{batch.external_id}" covers {batch.zone}. '
        f"Status: {batch.status.value}. "
        f"{verified} of {total} actions verified; {blocked} blocked. "
        f"{open_count} open incident(s) require attention."
        if open_count
        else (
            f'Batch "{batch.external_id}" covers {batch.zone}. '
            f"Status: {batch.status.value}. "
            f"{verified} of {total} actions verified; {blocked} blocked. "
            "No open incidents."
        )
    )

    measurement_gate = "QUARANTINED" if open_count > 0 else ("ELIGIBLE" if verified == total and total > 0 else "PENDING")

    zone_status: dict[str, str] = {}
    for sid in queries._canary_ids(batch):
        zone_status[sid] = "Canary store"
    for sid in queries._expansion_ids(batch):
        zone_status[sid] = "Expansion store"

    return ExplainResponse(
        answer=answer,
        evidence_chips=["Approved Action", "Batch Status", "Incident Log"],
        zone_status=zone_status,
        measurement_gate=measurement_gate,
    )
