from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.base import ADAPTERS
from app.ids import new_id
from app.services import behavior
from app.models import (
    ActionDecision,
    BatchStatus,
    Channel,
    ChannelDelivery,
    DeliveryStatus,
    ExecutionReceipt,
    Incident,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
    ReceiptStatus,
)
from app.services.audit import record_audit

CHANNELS = ["pos", "esl", "ecommerce"]


def _channel_enum(name: str) -> Channel:
    return Channel(name)


def verify_channel(db: Session, delivery: ChannelDelivery, action: PriceAction) -> ExecutionReceipt:
    """Resolve the channel's configured behavior, ask the adapter to build a
    normalized receipt from it, and persist it. Behavior comes from the scenario
    config — the adapter and engine have no product-specific logic."""
    adapter = ADAPTERS[delivery.channel.value]
    batch = db.get(PriceBatch, action.batch_id)
    profile = behavior.resolve_profile(
        db,
        batch.scenario_config_id if batch else None,
        action.sku,
        action.store_id,
        delivery.channel.value,
    )
    observed = behavior.observe(profile, action.approved_price, max(delivery.attempts, 1))
    raw = adapter.build_verify_receipt(
        sku=action.sku,
        store_id=action.store_id,
        approved_price=action.approved_price,
        observed=observed,
        behavior_type=profile.behavior_type.value if profile else "success",
        duplicate_ack=behavior.is_duplicate_ack(profile),
        delay_ms=profile.configured_delay_ms if profile else None,
    )

    if raw["status"] == "TIMEOUT":
        delivery.status = DeliveryStatus.TIMEOUT
        receipt_status = ReceiptStatus.TIMEOUT
        observed = None
    elif raw["status"] == "MISMATCH":
        delivery.status = DeliveryStatus.ACKED
        receipt_status = ReceiptStatus.MISMATCH
        observed = raw["observed_price"]
    else:
        delivery.status = DeliveryStatus.ACKED
        receipt_status = ReceiptStatus.VERIFIED
        observed = raw["observed_price"]

    # Replace any prior receipt(s) for this delivery (re-verification after retry).
    from sqlalchemy import delete as _delete

    db.execute(_delete(ExecutionReceipt).where(ExecutionReceipt.delivery_id == delivery.id))
    db.flush()

    receipt = ExecutionReceipt(
        id=new_id("rcpt"),
        delivery_id=delivery.id,
        channel=delivery.channel,
        expected_price=action.approved_price,
        observed_price=observed,
        status=receipt_status,
        raw_payload_json=dict(raw),
    )
    db.add(receipt)
    return receipt


def decide_action(action: PriceAction, receipts: list[ExecutionReceipt]) -> ActionDecision:
    """Pure rule: turn channel receipts into an action-level decision.

    - any MISMATCH  -> BLOCKED (critical; shopper could be overcharged)
    - any TIMEOUT   -> RETRY   (channel never acknowledged)
    - all VERIFIED  -> ELIGIBLE
    """
    statuses = {r.status for r in receipts}
    if ReceiptStatus.MISMATCH in statuses:
        return ActionDecision.BLOCKED
    if ReceiptStatus.TIMEOUT in statuses:
        return ActionDecision.RETRY
    return ActionDecision.ELIGIBLE


def _sync_incident(db: Session, action: PriceAction, receipts: list[ExecutionReceipt], decision: ActionDecision):
    """Create or clear the incident for an action based on its decision."""
    open_incident = db.scalar(
        select(Incident).where(
            Incident.action_id == action.id,
            Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]),
        )
    )

    if decision == ActionDecision.ELIGIBLE:
        if open_incident is not None:
            from datetime import timedelta

            from app.models import utcnow

            # Strictly increasing timestamps guarantee causal ordering on the
            # timeline (ack -> reconciliation verified -> resolved -> eligible),
            # even if the clock resolution would otherwise tie them.
            t = utcnow()
            offending = open_incident.offending_channel
            ack_receipt = next((r for r in receipts if offending and r.channel == offending), None)
            if ack_receipt is not None and ack_receipt.status == ReceiptStatus.VERIFIED:
                record_audit(
                    db,
                    incident_id=open_incident.id, action_id=action.id, batch_id=action.batch_id,
                    event=f"{offending.value.upper()} acknowledgement received",
                    detail=f"{offending.value.upper()} now reports ${action.approved_price:.2f} for "
                    f"{action.product_name} at Store {action.store_id}.",
                    actor="automated", created_at=t,
                )
                t = t + timedelta(microseconds=1)

            record_audit(
                db,
                incident_id=open_incident.id, action_id=action.id, batch_id=action.batch_id,
                event="Reconciliation verified all required channels",
                detail=f"POS, ESL and ecommerce all agree on ${action.approved_price:.2f} for "
                f"{action.product_name} at Store {action.store_id}.",
                actor="automated", created_at=t,
            )
            t = t + timedelta(microseconds=1)

            open_incident.status = IncidentStatus.RESOLVED
            open_incident.resolved_at = utcnow()
            record_audit(
                db,
                incident_id=open_incident.id, action_id=action.id, batch_id=action.batch_id,
                event="Incident resolved",
                detail=f"All channels for {action.product_name} at Store {action.store_id} now verified at "
                f"${action.approved_price:.2f}.",
                actor="automated", created_at=t,
            )
            t = t + timedelta(microseconds=1)

            record_audit(
                db,
                incident_id=open_incident.id, action_id=action.id, batch_id=action.batch_id,
                event="Action eligible for expansion",
                detail=f"{action.product_name} at Store {action.store_id} is verified across every channel and "
                f"may now expand to the remaining stores.",
                actor="automated", created_at=t,
            )
        return

    if open_incident is not None:
        return  # already tracked

    mismatch = next((r for r in receipts if r.status == ReceiptStatus.MISMATCH), None)
    timeout = next((r for r in receipts if r.status == ReceiptStatus.TIMEOUT), None)

    if mismatch is not None:
        summary = (
            f"{action.product_name} at Store {action.store_id}: shelf and ecommerce show "
            f"${action.approved_price:.2f}, but {mismatch.channel.value.upper()} reports "
            f"${mismatch.observed_price:.2f}. A shopper could be charged the higher price at checkout."
        )
        incident = Incident(
            id=new_id("inc"),
            batch_id=action.batch_id,
            action_id=action.id,
            type=IncidentType.PRICE_MISMATCH,
            severity=IncidentSeverity.CRITICAL,
            status=IncidentStatus.OPEN,
            summary=summary,
            offending_channel=mismatch.channel,
        )
        db.add(incident)
        record_audit(
            db,
            incident_id=incident.id,
            action_id=action.id,
            batch_id=action.batch_id,
            event="Critical incident opened",
            detail=summary,
            actor="system",
        )
    elif timeout is not None:
        is_deadline = action.is_perishable and action.markdown_deadline is not None
        summary = (
            f"{action.product_name} at Store {action.store_id}: the "
            f"{timeout.channel.value.upper()} update was not acknowledged."
        )
        if is_deadline:
            summary += " The markdown may not be visible to in-store shoppers before the sell-through deadline."
        incident = Incident(
            id=new_id("inc"),
            batch_id=action.batch_id,
            action_id=action.id,
            type=IncidentType.DEADLINE_RISK if is_deadline else IncidentType.CHANNEL_TIMEOUT,
            severity=IncidentSeverity.URGENT if is_deadline else IncidentSeverity.WARNING,
            status=IncidentStatus.OPEN,
            summary=summary,
            offending_channel=timeout.channel,
        )
        db.add(incident)
        record_audit(
            db,
            incident_id=incident.id,
            action_id=action.id,
            batch_id=action.batch_id,
            event="Deadline risk detected" if is_deadline else "Channel timeout detected",
            detail=summary,
            actor="system",
        )


def _is_pending_activation(action: PriceAction) -> bool:
    """True when this price is scheduled for the future and hasn't taken effect.

    Grocery prices are time-bound (the weekly ad starts Wednesday 6am). Before
    effective_at, the channels CORRECTLY still show the old price — flagging that
    as a mismatch would be a false alarm. NULL effective_at = live immediately."""
    if action.effective_at is None:
        return False
    from app.models import utcnow

    eff = action.effective_at
    now = utcnow()
    # Compare tz-aware vs naive safely (SQLite returns naive, PG tz-aware).
    if eff.tzinfo is None:
        now = now.replace(tzinfo=None)
    return eff > now


def reconcile_action(db: Session, action: PriceAction) -> ActionDecision:
    """Verify every channel for an action, persist receipts, and set its decision."""
    # Effective-dating guard: a not-yet-live price is PENDING activation, not a
    # mismatch. Skip channel verification (the old price showing is correct) and
    # do not open an incident — the action reconciles for real once it takes effect.
    if _is_pending_activation(action):
        action.decision = ActionDecision.PENDING
        db.flush()
        return ActionDecision.PENDING
    receipts = [verify_channel(db, d, action) for d in action.deliveries]
    decision = decide_action(action, receipts)
    action.decision = decision
    db.flush()
    _sync_incident(db, action, receipts, decision)
    return decision


def _audit_status_transition(db: Session, batch: PriceBatch, prev: BatchStatus) -> None:
    if prev == batch.status:
        return
    messages = {
        BatchStatus.BLOCKED: ("Zone expansion blocked", batch.block_reason or ""),
        BatchStatus.PARTIALLY_BLOCKED: ("Expansion held — actions still pending", batch.block_reason or ""),
        BatchStatus.READY_FOR_EXPANSION: (
            "Canary verified — ready for expansion",
            "All canary actions are verified across POS, ESL and ecommerce. The batch may now expand "
            "to the remaining stores.",
        ),
        BatchStatus.EXPANDING: ("Expansion started", "Publishing verified actions to the remaining stores."),
        BatchStatus.COMPLETED: ("Rollout completed", "All stores verified across every channel."),
    }
    if batch.status in messages:
        ev, detail = messages[batch.status]
        record_audit(db, batch_id=batch.id, event=ev, detail=detail, actor="automated")


def refresh_batch(db: Session, batch: PriceBatch) -> None:
    """Recompute batch-level status and expansion safety.

    Expansion is allowed ONLY when every canary action is verified (ELIGIBLE).
    Any action still BLOCKED (critical mismatch), RETRY (timeout / deadline risk),
    or PENDING holds the whole batch — a single resolved action never unblocks
    the zone on its own. Once expansion is active, the batch only COMPLETES after
    every expansion action verifies.
    """
    canary_group = next((g for g in batch.rollout_groups if g.kind == "canary"), None)
    exp_group = next((g for g in batch.rollout_groups if g.kind == "expansion"), None)
    canary_ids = set(canary_group.store_ids) if canary_group else set()
    exp_ids = set(exp_group.store_ids) if exp_group else set()
    canary_actions = [a for a in batch.actions if a.store_id in canary_ids]
    exp_actions = [a for a in batch.actions if a.store_id in exp_ids]
    expansion_active = bool(exp_group and exp_group.active)

    prev = batch.status

    if not expansion_active:
        blocked = [a for a in canary_actions if a.decision == ActionDecision.BLOCKED]
        retrying = [a for a in canary_actions if a.decision == ActionDecision.RETRY]
        pending = [a for a in canary_actions if a.decision == ActionDecision.PENDING]
        if blocked:
            batch.status = BatchStatus.BLOCKED
            batch.expansion_blocked = True
            batch.block_reason = (
                f"{len(blocked)} canary action(s) have a critical checkout mismatch. Expanding could "
                "expose shoppers to an incorrect price across the zone."
            )
        elif pending:
            batch.status = BatchStatus.CANARY_VERIFYING
            batch.expansion_blocked = True
            batch.block_reason = "Canary verification in progress."
        elif retrying:
            batch.status = BatchStatus.PARTIALLY_BLOCKED
            batch.expansion_blocked = True
            batch.block_reason = (
                f"{len(retrying)} canary action(s) are still awaiting channel acknowledgement "
                "(e.g. a shelf-label timeout). Expansion is held until every canary action is verified."
            )
        else:
            batch.status = BatchStatus.READY_FOR_EXPANSION
            batch.expansion_blocked = False
            batch.block_reason = None
    else:
        failed = [a for a in exp_actions if a.decision in (ActionDecision.BLOCKED, ActionDecision.RETRY)]
        pending = [a for a in exp_actions if a.decision == ActionDecision.PENDING]
        if failed:
            batch.status = BatchStatus.BLOCKED
            batch.expansion_blocked = True
            batch.block_reason = f"{len(failed)} expansion action(s) failed verification during rollout."
        elif pending:
            batch.status = BatchStatus.EXPANDING
            batch.expansion_blocked = False
            batch.block_reason = None
        else:
            batch.status = BatchStatus.COMPLETED
            batch.expansion_blocked = False
            batch.block_reason = None

    _audit_status_transition(db, batch, prev)
