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
    StoreTaskStatus,
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


def _ensure_acknowledged(
    db: Session, incident: Incident, action: PriceAction, actor: str, *, via: str | None = None
) -> bool:
    """Stamp an acknowledgement on the incident if it has none yet.

    This is the enforcement point for the reliability guarantee: every incident
    that is acted on (retry / rollback / resolve / store-task close) carries an
    acknowledgement record — who took ownership and when — even if the operator
    skipped the explicit Acknowledge button and went straight to recovery
    ("taking ownership by acting"). Returns True if it stamped a new ack.

    Idempotent: an already-acknowledged incident keeps its original actor/time.
    """
    if incident.acknowledged_at is not None:
        return False
    incident.acknowledged_at = utcnow()
    incident.acknowledged_by = actor
    detail = (
        f"{actor} acknowledged the incident for {action.product_name} at "
        f"Store {action.store_id}, taking ownership of recovery."
    )
    if via:
        detail += f" (auto-acknowledged via {via})"
    record_audit(
        db,
        incident_id=incident.id,
        action_id=action.id,
        batch_id=action.batch_id,
        event="Incident acknowledged",
        detail=detail,
        actor=actor,
    )
    return True


def acknowledge_incident(db: Session, incident_id: str, actor: str = "operator") -> Incident:
    """Operator takes ownership of an open incident (the human-in-the-loop gate).

    Explicit first step of the recovery workflow: OPEN incident → acknowledged.
    Records actor + timestamp + audit. Idempotent (re-acknowledging is a no-op
    that preserves the original owner). Rejected once the incident is terminal —
    you cannot acknowledge an already-closed incident.
    """
    incident = _lock_incident(db, incident_id)
    if incident.status in TERMINAL:
        raise RecoveryError(
            f"Incident already {incident.status.value}; nothing to acknowledge."
        )
    action = db.get(PriceAction, incident.action_id)
    _ensure_acknowledged(db, incident, action, actor)
    db.commit()
    db.refresh(incident)
    return incident


def retry_incident(db: Session, incident_id: str, actor: str = "operator") -> Incident:
    incident = _lock_incident(db, incident_id)
    if incident.status in TERMINAL:
        raise RecoveryError(f"Incident already {incident.status.value}; cannot retry.")

    action = db.get(PriceAction, incident.action_id)
    channel = incident.offending_channel or Channel.POS
    # Every recovery action implies the operator owns the incident. Stamp the
    # acknowledgement first (no-op if they already clicked Acknowledge), so the
    # audit trail always reads ack -> retry, never an un-owned recovery.
    _ensure_acknowledged(db, incident, action, actor, via="retry")
    incident.status = IncidentStatus.RETRYING

    record_audit(
        db,
        incident_id=incident.id,
        action_id=action.id,
        batch_id=action.batch_id,
        event=f"{channel.value.upper()} retry requested",
        detail=f"{actor} retried the {channel.value.upper()} update for "
        f"{action.product_name} at Store {action.store_id}.",
        actor=actor,
    )

    delivery = _delivery_for(db, action.id, channel)
    if delivery is not None:
        delivery.attempts += 1
        ADAPTERS[channel.value].publish_price_change(
            sku=action.sku, store_id=action.store_id, approved_price=action.approved_price
        )

    # Re-run reconciliation; verify_channel observes the healed channel and
    # _sync_incident emits the causal sequence (ack -> reconciliation verified
    # -> resolved -> eligible) when the action becomes eligible.
    reconciliation.reconcile_action(db, action)
    batch = db.get(PriceBatch, action.batch_id)
    if batch is not None:
        reconciliation.refresh_batch(db, batch)

    db.commit()
    db.refresh(incident)
    return incident


def rollback_incident(db: Session, incident_id: str, actor: str = "operator") -> Incident:
    incident = _lock_incident(db, incident_id)
    if incident.status in TERMINAL:
        raise RecoveryError(f"Incident already {incident.status.value}; cannot roll back.")

    action = db.get(PriceAction, incident.action_id)
    _ensure_acknowledged(db, incident, action, actor, via="rollback")
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
        actor=actor,
    )
    db.commit()
    db.refresh(incident)
    return incident


def create_store_task(
    db: Session, incident_id: str, instruction: str | None = None, actor: str = "operator"
) -> StoreTask:
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
        actor=actor,
    )
    db.commit()
    db.refresh(task)
    return task


def complete_store_task(db: Session, incident_id: str, actor: str = "operator") -> StoreTask:
    """Mark the incident's open verification task DONE — the human-in-the-loop close.

    Represents "the floor associate physically verified the shelf and confirmed."
    Locks the incident first (same row lock as every other recovery action), finds
    the single OPEN StoreTask, flips it to DONE, writes an audit event, and then
    re-checks whether the incident can now resolve: if every channel agrees the
    action heals and we close the incident in the same transaction (the causal
    "associate verified -> reconciliation verified -> resolved" sequence).

    A DONE task no longer counts against measurement eligibility or the receipt's
    open-task list, so completing it is what lets a rolled-back / awaiting-verify
    action re-enter downstream measurement.
    """
    incident = _lock_incident(db, incident_id)
    task = db.scalar(
        select(StoreTask)
        .where(
            StoreTask.incident_id == incident.id,
            StoreTask.status == StoreTaskStatus.OPEN,
        )
        .order_by(StoreTask.created_at)
        .with_for_update()
    )
    if task is None:
        raise RecoveryError(
            "No open store-verification task for this incident. "
            "Create one before completing it."
        )

    action = db.get(PriceAction, incident.action_id)
    _ensure_acknowledged(db, incident, action, actor, via="store-task")
    task.status = StoreTaskStatus.DONE
    record_audit(
        db,
        incident_id=incident.id,
        action_id=action.id,
        batch_id=action.batch_id,
        event="Store verification task completed",
        detail=f"{actor} confirmed the shelf price for {action.product_name} at "
        f"Store {action.store_id} was physically verified. Manual recovery task closed.",
        actor=actor,
    )

    # The human verification may have removed the last thing holding the incident
    # open. Re-reconcile; if every channel now agrees, close it in the same
    # transaction so the operator does not have to click Resolve separately.
    decision = reconciliation.reconcile_action(db, action)
    if incident.status not in TERMINAL and decision == ActionDecision.ELIGIBLE:
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
            event="Incident resolved after verification",
            detail=f"{action.product_name} at Store {action.store_id} verified across "
            f"all channels following the completed store task.",
            actor=actor,
        )

    db.commit()
    db.refresh(task)
    return task


def resolve_incident(db: Session, incident_id: str, actor: str = "operator") -> Incident:
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

    # Guarantee an acknowledgement is on record before closing — no incident is
    # ever resolved without an owner. (No-op if already acknowledged.)
    _ensure_acknowledged(db, incident, action, actor, via="resolve")
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
        actor=actor,
    )
    db.commit()
    db.refresh(incident)
    return incident
