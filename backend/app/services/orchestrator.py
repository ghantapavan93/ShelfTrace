from __future__ import annotations

import logging
import random
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.adapters.base import ADAPTERS
from app.config import settings
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
    utcnow,
)
from app.services import reconciliation
from app.services.audit import record_audit
from app.services.dead_letter import alert as dead_letter_alert

logger = logging.getLogger("shelftrace.orchestrator")

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

    # Chain a reconcile step through the outbox. Dict payload — SQLAlchemy
    # writes JSONB on Postgres and JSON on SQLite (see models.JSONColumn).
    db.add(
        OutboxEvent(
            id=new_id("evt"),
            event_type="RECONCILE_REQUESTED",
            aggregate_id=action.id,
            payload_json={"action_id": action.id, "batch_id": action.batch_id},
            status=OutboxStatus.PENDING,
        )
    )


def _handle_event(db: Session, event: OutboxEvent) -> None:
    payload = event.payload_json  # dict (JSON column auto-deserializes)
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


def _next_attempt_delay(attempts: int) -> float:
    """Exponential backoff with jitter, clamped at outbox_retry_max_seconds.

    delay = min(MAX, base * 2^(attempts-1)) + uniform_jitter[0, delay*0.3]

    The jitter spreads concurrent retries so a recovering downstream doesn't
    get re-stampeded at deterministic intervals.
    """
    base = max(0.1, settings.outbox_retry_base_seconds)
    cap = max(base, settings.outbox_retry_max_seconds)
    raw = min(cap, base * (2 ** max(0, attempts - 1)))
    jitter = random.uniform(0, raw * 0.3)
    return raw + jitter


def process_outbox_once(db: Session, limit: int = 50) -> int:
    """Process a wave of pending/retrying outbox events. Returns the number processed.

    Filter respects ``next_attempt_at`` so failed events back off exponentially
    before the worker picks them up again.
    """
    now = utcnow()
    stmt = (
        select(OutboxEvent)
        .where(OutboxEvent.status.in_([OutboxStatus.PENDING, OutboxStatus.RETRYING]))
        .where(or_(OutboxEvent.next_attempt_at.is_(None), OutboxEvent.next_attempt_at <= now))
        .order_by(OutboxEvent.created_at)
        .limit(limit)
    )
    if engine.dialect.name == "postgresql":
        # SKIP LOCKED lets the inline drain and the standalone worker run
        # concurrently without double-processing the same event.
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
            event.last_error = None
            event.next_attempt_at = None
        except Exception as exc:
            event.last_error = repr(exc)[:500]
            if event.attempts >= settings.outbox_max_attempts:
                event.status = OutboxStatus.DEAD_LETTER
                event.next_attempt_at = None
                dead_letter_alert(event, str(exc))
            else:
                event.status = OutboxStatus.RETRYING
                delay = _next_attempt_delay(event.attempts)
                event.next_attempt_at = utcnow() + timedelta(seconds=delay)
                logger.warning(
                    "outbox.retry_scheduled",
                    extra={
                        "event_id": event.id,
                        "event_type": event.event_type,
                        "attempts": event.attempts,
                        "next_attempt_in_seconds": round(delay, 2),
                        "error": event.last_error,
                    },
                )
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


def expand_batch(db: Session, batch: PriceBatch, actor: str = "operator") -> PriceBatch:
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
        detail=f"{actor} expanded the batch to {len(exp_ids)} remaining store(s): "
        f"{', '.join(sorted(exp_ids))}.",
        actor=actor,
    )

    for action in exp_actions:
        db.add(
            OutboxEvent(
                id=new_id("evt"),
                event_type="EXPANSION_PUBLISH_REQUESTED",
                aggregate_id=action.id,
                payload_json={"action_id": action.id, "batch_id": batch.id},
                status=OutboxStatus.PENDING,
            )
        )
    db.commit()

    drain(db)
    db.refresh(batch)
    return batch
