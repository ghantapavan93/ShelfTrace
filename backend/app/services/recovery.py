from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.base import ADAPTERS
from app.ids import new_id
from app.models import (
    ActionDecision,
    Channel,
    ChannelDelivery,
    Incident,
    IncidentStatus,
    PriceAction,
    PriceBatch,
    StoreTask,
    utcnow,
)
from app.services import reconciliation
from app.services.audit import record_audit

TERMINAL = {IncidentStatus.RESOLVED, IncidentStatus.ROLLED_BACK}


class RecoveryError(Exception):
    """Raised when a recovery action is invalid for the incident's current state."""


def _lock_incident(db: Session, incident_id: str) -> Incident:
    """Lock the incident row so only one recovery action mutates it at a time."""
    incident = db.scalar(
        select(Incident).where(Incident.id == incident_id).with_for_update()
    )
    if incident is None:
        raise RecoveryError(f"Incident {incident_id} not found")
    return incident


def _delivery_for(db: Session, action_id: str, channel: Channel) -> ChannelDelivery | None:
    return db.scalar(
        select(ChannelDelivery).where(
            ChannelDelivery.action_id == action_id, ChannelDelivery.channel == channel
        )
    )


def retry_incident(db: Session, incident_id: str) -> Incident:
    incident = _lock_incident(db, incident_id)
    if incident.status in TERMINAL:
        raise RecoveryError(f"Incident already {incident.status.value}; cannot retry.")

    incident.status = IncidentStatus.RETRYING
    action = db.get(PriceAction, incident.action_id)
    channel = incident.offending_channel or Channel.POS

    record_audit(
        db,
        incident_id=incident.id,
        action_id=action.id,
        batch_id=action.batch_id,
        event=f"{channel.value.upper()} retry requested",
        detail=f"Operator retried the {channel.value.upper()} update for "
        f"{action.product_name} at Store {action.store_id}.",
        actor="operator",
    )

    delivery = _delivery_for(db, action.id, channel)
    if delivery is not None:
        delivery.attempts += 1
        ADAPTERS[channel.value].publish_price_change(
            sku=action.sku, store_id=action.store_id, approved_price=action.approved_price
        )

    # Re-run reconciliation; verify_channel will observe the healed channel.
    decision = reconciliation.reconcile_action(db, action)
    batch = db.get(PriceBatch, action.batch_id)
    if batch is not None:
        reconciliation.refresh_batch(db, batch)

    if decision == ActionDecision.ELIGIBLE:
        record_audit(
            db,
            incident_id=incident.id,
            action_id=action.id,
            batch_id=action.batch_id,
            event=f"{channel.value.upper()} acknowledgement received",
            detail=f"{channel.value.upper()} now reports ${action.approved_price:.2f}. "
            f"{action.product_name} at Store {action.store_id} is verified and eligible for expansion.",
            actor="automated",
        )

    db.commit()
    db.refresh(incident)
    return incident


def rollback_incident(db: Session, incident_id: str) -> Incident:
    incident = _lock_incident(db, incident_id)
    if incident.status in TERMINAL:
        raise RecoveryError(f"Incident already {incident.status.value}; cannot roll back.")

    action = db.get(PriceAction, incident.action_id)
    # Temporarily restore the shelf label to the prior price so it matches checkout
    # until the mismatch is fixed at the source.
    ADAPTERS["esl"].rollback_price_change(
        sku=action.sku, store_id=action.store_id, prior_price=action.prior_price
    )
    incident.status = IncidentStatus.ROLLED_BACK
    incident.resolved_at = utcnow()
    action.decision = ActionDecision.BLOCKED

    record_audit(
        db,
        incident_id=incident.id,
        action_id=action.id,
        batch_id=action.batch_id,
        event="Shelf label rolled back",
        detail=f"Shelf label for {action.product_name} at Store {action.store_id} temporarily "
        f"restored to ${action.prior_price:.2f} to match checkout while the mismatch is resolved.",
        actor="operator",
    )
    db.commit()
    db.refresh(incident)
    return incident


def create_store_task(db: Session, incident_id: str, instruction: str | None = None) -> StoreTask:
    incident = _lock_incident(db, incident_id)
    action = db.get(PriceAction, incident.action_id)
    text = instruction or (
        f"Verify the shelf price for {action.product_name} at Store {action.store_id} "
        f"matches the register (${action.approved_price:.2f}) and confirm."
    )
    task = StoreTask(
        id=new_id("task"),
        incident_id=incident.id,
        store_id=action.store_id,
        instruction=text,
    )
    db.add(task)
    record_audit(
        db,
        incident_id=incident.id,
        action_id=action.id,
        batch_id=action.batch_id,
        event="Store verification task created",
        detail=text,
        actor="operator",
    )
    db.commit()
    db.refresh(task)
    return task


def resolve_incident(db: Session, incident_id: str) -> Incident:
    incident = _lock_incident(db, incident_id)
    if incident.status in TERMINAL:
        raise RecoveryError(f"Incident already {incident.status.value}; nothing to resolve.")

    action = db.get(PriceAction, incident.action_id)
    # Re-verify before resolving so we never close on a stale view.
    decision = reconciliation.reconcile_action(db, action)
    if decision != ActionDecision.ELIGIBLE:
        db.commit()
        raise RecoveryError(
            "Cannot resolve: channels still disagree. Retry the failing channel first."
        )

    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = utcnow()
    batch = db.get(PriceBatch, action.batch_id)
    if batch is not None:
        reconciliation.refresh_batch(db, batch)
    record_audit(
        db,
        incident_id=incident.id,
        action_id=action.id,
        batch_id=action.batch_id,
        event="Incident resolved by operator",
        detail=f"{action.product_name} at Store {action.store_id} verified across all channels.",
        actor="operator",
    )
    db.commit()
    db.refresh(incident)
    return incident
