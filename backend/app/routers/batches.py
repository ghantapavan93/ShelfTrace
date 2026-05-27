from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AuditEvent,
    Channel,
    ChannelDelivery,
    ExecutionReceipt,
    PriceAction,
    PriceBatch,
)
from app.rate_limit import limit_write
from app.routers.common import get_batch_or_404
from app.schemas import BatchDetail, BatchSummary, PriceBatchIn
from app.scope import apply_filter, current_scope
from app.security import Identity, require_operator
from app.services import orchestrator, queries
from app.services.ingestion import ingest_batch

router = APIRouter(prefix="/api/v1", tags=["batches"])


@router.post("/price-batches", response_model=BatchSummary, status_code=202)
@limit_write()
def create_batch(
    payload: PriceBatchIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    result = ingest_batch(db, payload)
    # Single-node demo: drain the outbox inline so results are immediately visible.
    orchestrator.drain(db)
    db.refresh(result.batch)
    return queries.batch_summary(db, result.batch)


@router.get("/batches", response_model=list[BatchSummary])
def list_batches(
    db: Session = Depends(get_db),
    scope: str | None = Query(
        None,
        description="Data scope: 'live' (user uploads only), 'demo' (seeded only), 'all'. Default all.",
    ),
):
    """List every batch the platform knows about. The scope filter is the
    real Live/Demo backend boundary — `scope=live` excludes seeded showcase
    batches (Memorial Day, Realistic Scale, certification sandbox)."""
    resolved = current_scope(scope)
    stmt = select(PriceBatch).order_by(PriceBatch.created_at.desc())
    stmt = apply_filter(stmt, PriceBatch.source_run_id, resolved)
    batches = list(db.scalars(stmt))
    return [queries.batch_summary(db, b) for b in batches]


@router.get("/batches/{external_id}", response_model=BatchDetail)
def get_batch(external_id: str, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, external_id)
    return queries.batch_detail(db, batch)


@router.get("/batches/{external_id}/audit")
def get_batch_audit(external_id: str, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, external_id)
    return queries.recent_audit(db, batch.id, limit=100)


@router.get("/batches/{external_id}/actions/{action_id}/channels/{channel}/history")
def get_channel_delivery_history(
    external_id: str,
    action_id: str,
    channel: str,
    db: Session = Depends(get_db),
):
    """Return the full delivery story for one matrix cell.

    The /operations/batches/{id} matrix shows three channel statuses per
    action (POS / ESL / Ecommerce). Clicking a cell opens a side drawer
    that needs to show the underlying causal chain: when the dispatch
    fired, what observed price the channel reported, how many retries
    occurred, and every audit event that mentioned this action+channel.

    Output (one consolidated payload — the drawer doesn't need additional
    round-trips):
      • delivery        — the live ChannelDelivery row
      • receipt         — the linked ExecutionReceipt (if any)
      • action          — the parent action's price + product info
      • audit_events    — every AuditEvent for this action where the
                          channel matches in detail/event text
    """
    # Validate batch + action belong together
    batch = get_batch_or_404(db, external_id)
    action = db.scalar(
        select(PriceAction).where(
            PriceAction.id == action_id, PriceAction.batch_id == batch.id
        )
    )
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found for this batch")

    try:
        channel_enum = Channel(channel.lower())
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown channel '{channel}'. Use pos | esl | ecommerce.",
        )

    delivery = db.scalar(
        select(ChannelDelivery).where(
            ChannelDelivery.action_id == action_id,
            ChannelDelivery.channel == channel_enum,
        )
    )
    if delivery is None:
        return {
            "action": {
                "id": action.id,
                "sku": action.sku,
                "product_name": action.product_name,
                "store_id": action.store_id,
                "approved_price": action.approved_price,
                "prior_price": action.prior_price,
                "reason": action.reason,
                "decision": action.decision.value,
            },
            "channel": channel.lower(),
            "delivery": None,
            "receipt": None,
            "audit_events": [],
            "note": "No delivery row exists for this cell yet — channel was not dispatched.",
        }

    receipt = db.scalar(
        select(ExecutionReceipt).where(ExecutionReceipt.delivery_id == delivery.id)
    )

    # Audit events for this action where the event text references this channel.
    # The orchestrator + reconciliation emit channel-tagged events using the
    # lowercase channel name in either the `event` field or the `detail`.
    chan_name = channel.lower()
    audit_rows = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.action_id == action_id)
        .order_by(AuditEvent.created_at.asc())
    ).all()
    relevant = [
        e
        for e in audit_rows
        if chan_name in (e.event or "").lower() or chan_name in (e.detail or "").lower()
    ]

    return {
        "action": {
            "id": action.id,
            "sku": action.sku,
            "product_name": action.product_name,
            "store_id": action.store_id,
            "approved_price": action.approved_price,
            "prior_price": action.prior_price,
            "reason": action.reason,
            "decision": action.decision.value,
        },
        "channel": chan_name,
        "delivery": {
            "id": delivery.id,
            "status": delivery.status.value,
            "attempts": delivery.attempts,
            "created_at": delivery.created_at.isoformat() if delivery.created_at else None,
            "updated_at": delivery.updated_at.isoformat() if delivery.updated_at else None,
        },
        "receipt": (
            {
                "id": receipt.id,
                "status": receipt.status.value,
                "expected_price": receipt.expected_price,
                "observed_price": receipt.observed_price,
                "received_at": receipt.received_at.isoformat() if receipt.received_at else None,
                "raw_payload_json": receipt.raw_payload_json,
            }
            if receipt
            else None
        ),
        "audit_events": [
            {
                "id": e.id,
                "event": e.event,
                "detail": e.detail,
                "actor": e.actor,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in relevant
        ],
    }


@router.post("/batches/{external_id}/expand", response_model=BatchSummary)
@limit_write()
def expand_batch(
    external_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    batch = get_batch_or_404(db, external_id)
    try:
        orchestrator.expand_batch(db, batch, actor=identity.actor)
    except orchestrator.ExpansionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return queries.batch_summary(db, batch)
