from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.base import ADAPTERS
from app.database import engine
from app.ids import new_id
from app.models import (
    Channel,
    ChannelDelivery,
    DeliveryStatus,
    OutboxEvent,
    OutboxStatus,
    PriceAction,
    PriceBatch,
)
from app.models import utcnow
from app.services import reconciliation
from app.services.audit import record_audit

CHANNELS = ["pos", "esl", "ecommerce"]


def _publish_action(db: Session, action: PriceAction) -> None:
    """Create channel deliveries for an action and publish to each channel."""
    for ch in CHANNELS:
        delivery = ChannelDelivery(
            id=new_id("del"),
            action_id=action.id,
            channel=Channel(ch),
            status=DeliveryStatus.SENT,
            attempts=1,
        )
        ADAPTERS[ch].publish_price_change(
            sku=action.sku, store_id=action.store_id, approved_price=action.approved_price
        )
        db.add(delivery)
    db.flush()

    # Chain a reconcile step through the outbox.
    db.add(
        OutboxEvent(
            id=new_id("evt"),
            event_type="RECONCILE_REQUESTED",
            aggregate_id=action.id,
            payload_json=json.dumps({"action_id": action.id, "batch_id": action.batch_id}),
            status=OutboxStatus.PENDING,
        )
    )


def _handle_event(db: Session, event: OutboxEvent) -> None:
    payload = json.loads(event.payload_json)
    action = db.get(PriceAction, payload["action_id"])
    if action is None:
        return

    if event.event_type in ("CANARY_PUBLISH_REQUESTED", "EXPANSION_PUBLISH_REQUESTED"):
        _publish_action(db, action)
    elif event.event_type == "RECONCILE_REQUESTED":
        reconciliation.reconcile_action(db, action)
        batch = db.get(PriceBatch, action.batch_id)
        if batch is not None:
            reconciliation.refresh_batch(db, batch)


def process_outbox_once(db: Session, limit: int = 50) -> int:
    """Process a wave of pending outbox events. Returns the number processed."""
    # Claim pending events. On Postgres, FOR UPDATE SKIP LOCKED lets the inline
    # drain and the standalone worker run concurrently without double-processing
    # the same event. SQLite (tests) doesn't support it, so we skip the clause.
    stmt = (
        select(OutboxEvent)
        .where(OutboxEvent.status == OutboxStatus.PENDING)
        .order_by(OutboxEvent.created_at)
        .limit(limit)
    )
    if engine.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    events = list(db.scalars(stmt))
    if not events:
        return 0

    for event in events:
        event.status = OutboxStatus.PROCESSING
        event.attempts += 1
        try:
            _handle_event(db, event)
            event.status = OutboxStatus.PROCESSED
            event.processed_at = utcnow()
        except Exception as exc:  # pragma: no cover - defensive
            event.status = OutboxStatus.RETRYING if event.attempts < 5 else OutboxStatus.DEAD_LETTER
            record_audit(
                db,
                event="Outbox processing error",
                detail=f"Event {event.id} ({event.event_type}) failed: {exc}",
                actor="system",
            )
    db.commit()
    return len(events)


def drain(db: Session, max_waves: int = 20) -> None:
    """Process the outbox until no pending events remain (deterministic for demo/tests)."""
    for _ in range(max_waves):
        if process_outbox_once(db) == 0:
            break


class ExpansionError(Exception):
    """Raised when a batch is not eligible to expand."""


def expand_batch(db: Session, batch: PriceBatch) -> PriceBatch:
    """Expand a verified batch to its remaining (expansion) stores.

    Only allowed once every canary action is verified. Expansion-store deliveries
    are created *now* (not at ingestion) so an unsafe batch never reaches them.
    """
    from app.models import BatchStatus

    reconciliation.refresh_batch(db, batch)
    if batch.status != BatchStatus.READY_FOR_EXPANSION:
        raise ExpansionError(
            f"Batch is '{batch.status.value}', not 'ready_for_expansion'. "
            "Every canary action must be verified before expansion."
        )

    exp_group = next((g for g in batch.rollout_groups if g.kind == "expansion"), None)
    exp_ids = set(exp_group.store_ids) if exp_group else set()
    exp_actions = [a for a in batch.actions if a.store_id in exp_ids]

    if exp_group is not None:
        exp_group.active = True
    batch.status = BatchStatus.EXPANDING

    record_audit(
        db,
        batch_id=batch.id,
        event="Expansion authorized",
        detail=f"Operator expanded the batch to {len(exp_ids)} remaining store(s): "
        f"{', '.join(sorted(exp_ids))}.",
        actor="operator",
    )

    for action in exp_actions:
        db.add(
            OutboxEvent(
                id=new_id("evt"),
                event_type="EXPANSION_PUBLISH_REQUESTED",
                aggregate_id=action.id,
                payload_json=json.dumps({"action_id": action.id, "batch_id": batch.id}),
                status=OutboxStatus.PENDING,
            )
        )
    db.commit()

    drain(db)
    db.refresh(batch)
    return batch
