"""Execution Measurement Eligibility.

Derives whether an already-executed price action is *eligible for downstream
performance measurement* — a distinct concept from "eligible for rollout
expansion" (the existing ``ActionDecision.ELIGIBLE``).

Why distinct:
    * "Eligible for expansion" answers: may this action be pushed to more
      stores? (canary-verification gate)
    * "Eligible for measurement" answers: may a downstream analytics layer
      attribute revenue / margin / lift / KVI signal to this action? (must be
      executed *correctly* across every required shopper-facing channel —
      otherwise the data is poisoned)

This module is **pure derivation**. It introduces no new tables, no
migrations, no new write paths, no new audit events. Every value comes from
fields the validated core already maintains:

    * ``PriceAction.decision``  (PENDING / VERIFIED / ELIGIBLE / RETRY / BLOCKED)
    * ``action.deliveries[*].receipt.status``  (ReceiptStatus: verified / mismatch / timeout)
    * ``Incident.status``  (OPEN / RETRYING / RESOLVED / ROLLED_BACK)
    * ``StoreTask.status``  (OPEN / DONE)

Performance: ``derive_eligibility`` accepts pre-loaded incidents + store
tasks so it can be called per-action inside a batch loop without N+1
queries. The ``derive_eligibility_for_batch`` helper pre-fetches both in two
bounded queries and returns a ``{action_id: view}`` map.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ActionDecision,
    Incident,
    IncidentStatus,
    PriceAction,
    PriceBatch,
    ReceiptStatus,
    StoreTask,
    StoreTaskStatus,
)


class MeasurementEligibility(str, enum.Enum):
    """The four states the brief specifies. Precedence: rollback > awaiting ack
    > mismatch > eligible."""

    INELIGIBLE_EXECUTION_NOT_VERIFIED = "INELIGIBLE_EXECUTION_NOT_VERIFIED"
    INELIGIBLE_AWAITING_ACKNOWLEDGEMENT = "INELIGIBLE_AWAITING_ACKNOWLEDGEMENT"
    ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED = "ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED"
    EXCLUDED_RECOVERY_INCOMPLETE = "EXCLUDED_RECOVERY_INCOMPLETE"


@dataclass(frozen=True)
class EligibilityResult:
    """The structured derivation result. Plain dataclass, no DB binding."""

    status: MeasurementEligibility
    reason: str
    required_channels: list[str]
    verified_channels: list[str]
    blocked_channel: str | None
    summary: str

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "reason": self.reason,
            "required_channels": list(self.required_channels),
            "verified_channels": list(self.verified_channels),
            "blocked_channel": self.blocked_channel,
            "summary": self.summary,
        }


# ---------------------------------------------------------------------------
# Core derivation — pure function, no DB I/O
# ---------------------------------------------------------------------------
def derive_eligibility(
    action: PriceAction,
    incidents: Sequence[Incident] = (),
    open_store_tasks: Sequence[StoreTask] = (),
) -> EligibilityResult:
    """Derive eligibility from already-loaded state. Idempotent. Order-safe.

    Args:
        action: the PriceAction (its ``deliveries`` relationship must be loaded;
            each delivery's ``receipt`` is read to inspect ReceiptStatus).
        incidents: every Incident attached to this action (typically 0 or 1,
            but a rollback history may produce multiple). Pass empty for a
            channel-only check.
        open_store_tasks: open StoreTasks attached to any of the action's
            incidents (only ``OPEN`` ones matter). Pass empty if none.

    Precedence (highest first):
        1. EXCLUDED_RECOVERY_INCOMPLETE  — any ROLLED_BACK incident; or any
           open StoreTask while the action has not reached ELIGIBLE.
        2. INELIGIBLE_AWAITING_ACKNOWLEDGEMENT — action.decision == RETRY, or
           any RETRYING incident, or any TIMEOUT receipt that has not yet
           resolved.
        3. INELIGIBLE_EXECUTION_NOT_VERIFIED — action.decision == BLOCKED or
           any MISMATCH receipt currently observed.
        4. ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED — action.decision ==
           ELIGIBLE AND no open/retrying incident AND every delivery has a
           VERIFIED receipt.
        5. Default safe — INELIGIBLE_EXECUTION_NOT_VERIFIED (pending,
           insufficient evidence).
    """
    required_channels = [d.channel.value for d in action.deliveries]
    verified_channels = [
        d.channel.value
        for d in action.deliveries
        if d.receipt is not None and d.receipt.status == ReceiptStatus.VERIFIED
    ]
    mismatch_delivery = next(
        (
            d
            for d in action.deliveries
            if d.receipt is not None and d.receipt.status == ReceiptStatus.MISMATCH
        ),
        None,
    )
    timeout_delivery = next(
        (
            d
            for d in action.deliveries
            if d.receipt is not None and d.receipt.status == ReceiptStatus.TIMEOUT
        ),
        None,
    )

    # 1 — rollback / unresolved recovery exclusion (highest precedence).
    rolled_back = any(i.status == IncidentStatus.ROLLED_BACK for i in incidents)
    open_tasks = [t for t in open_store_tasks if t.status == StoreTaskStatus.OPEN]
    if rolled_back or (open_tasks and action.decision != ActionDecision.ELIGIBLE):
        return EligibilityResult(
            status=MeasurementEligibility.EXCLUDED_RECOVERY_INCOMPLETE,
            reason="ROLLBACK_OR_PENDING_RECOVERY",
            required_channels=required_channels,
            verified_channels=verified_channels,
            blocked_channel=None,
            summary=(
                "Action excluded from downstream performance measurement — an "
                "operator rollback or unresolved manual recovery task is in place."
            ),
        )

    # 2 — awaiting acknowledgement (retry in progress).
    has_retrying_incident = any(i.status == IncidentStatus.RETRYING for i in incidents)
    if action.decision == ActionDecision.RETRY or has_retrying_incident or timeout_delivery:
        offending = (
            timeout_delivery.channel.value.upper()
            if timeout_delivery
            else next(
                (i.offending_channel.value.upper() for i in incidents if i.offending_channel),
                "CHANNEL",
            )
        )
        return EligibilityResult(
            status=MeasurementEligibility.INELIGIBLE_AWAITING_ACKNOWLEDGEMENT,
            reason=f"AWAITING_{offending}_ACK",
            required_channels=required_channels,
            verified_channels=verified_channels,
            blocked_channel=offending.lower() if offending != "CHANNEL" else None,
            summary=(
                f"Awaiting {offending} acknowledgement. Retry in progress — not "
                "yet eligible for downstream performance measurement."
            ),
        )

    # 3 — mismatch / blocked.
    if action.decision == ActionDecision.BLOCKED or mismatch_delivery is not None:
        ch = (
            mismatch_delivery.channel.value
            if mismatch_delivery
            else next(
                (i.offending_channel.value for i in incidents if i.offending_channel),
                "pos",
            )
        )
        return EligibilityResult(
            status=MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED,
            reason=f"{ch.upper()}_PRICE_MISMATCH",
            required_channels=required_channels,
            verified_channels=verified_channels,
            blocked_channel=ch,
            summary=(
                f"{ch.upper()} reports a different price than the approved value. "
                "Execution is not verified — ineligible for downstream performance "
                "measurement until acknowledgement and reconciliation succeed."
            ),
        )

    # 4 — fully eligible.
    if (
        action.decision == ActionDecision.ELIGIBLE
        and not any(i.status in (IncidentStatus.OPEN, IncidentStatus.RETRYING) for i in incidents)
        and len(verified_channels) == len(required_channels)
        and len(required_channels) > 0
    ):
        return EligibilityResult(
            status=MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED,
            reason="ALL_REQUIRED_CHANNELS_VERIFIED",
            required_channels=required_channels,
            verified_channels=verified_channels,
            blocked_channel=None,
            summary=(
                "All required shopper-facing channels verified the approved price. "
                "This action is eligible for downstream performance measurement."
            ),
        )

    # 5 — default safe (pending, insufficient evidence).
    return EligibilityResult(
        status=MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED,
        reason="EXECUTION_PENDING",
        required_channels=required_channels,
        verified_channels=verified_channels,
        blocked_channel=None,
        summary=(
            "Execution evidence is incomplete. Not eligible for downstream "
            "performance measurement until every required channel acknowledges."
        ),
    )


# ---------------------------------------------------------------------------
# Batch helper — bounded queries, no N+1
# ---------------------------------------------------------------------------
def derive_eligibility_for_batch(
    db: Session, batch: PriceBatch
) -> dict[str, EligibilityResult]:
    """Compute eligibility for every action in a batch using **two bounded
    queries** (incidents + store tasks). Safe for list/overview pages."""
    all_incidents = list(
        db.scalars(select(Incident).where(Incident.batch_id == batch.id))
    )
    incidents_by_action: dict[str, list[Incident]] = {}
    incident_ids: list[str] = []
    for inc in all_incidents:
        incidents_by_action.setdefault(inc.action_id, []).append(inc)
        incident_ids.append(inc.id)

    tasks_by_action: dict[str, list[StoreTask]] = {}
    if incident_ids:
        all_tasks = list(
            db.scalars(select(StoreTask).where(StoreTask.incident_id.in_(incident_ids)))
        )
        incident_to_action = {i.id: i.action_id for i in all_incidents}
        for task in all_tasks:
            action_id = incident_to_action.get(task.incident_id)
            if action_id:
                tasks_by_action.setdefault(action_id, []).append(task)

    return {
        a.id: derive_eligibility(
            a,
            incidents_by_action.get(a.id, []),
            tasks_by_action.get(a.id, []),
        )
        for a in batch.actions
    }


# ---------------------------------------------------------------------------
# Single-action helper for incident-detail callers
# ---------------------------------------------------------------------------
def derive_eligibility_for_action(db: Session, action: PriceAction) -> EligibilityResult:
    """Compute eligibility for ONE action. Two bounded queries (incidents +
    store tasks). Safe for the incident-detail page."""
    incidents = list(
        db.scalars(select(Incident).where(Incident.action_id == action.id))
    )
    incident_ids = [i.id for i in incidents]
    open_tasks: list[StoreTask] = []
    if incident_ids:
        open_tasks = list(
            db.scalars(
                select(StoreTask).where(StoreTask.incident_id.in_(incident_ids))
            )
        )
    return derive_eligibility(action, incidents, open_tasks)
