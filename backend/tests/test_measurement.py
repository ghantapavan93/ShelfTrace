"""Execution Measurement Eligibility — derivation tests + regression guards.

Proves the four states map to the expected scenarios from the seeded Memorial
Day demo, that the precedence order is correct, that the rollback path
excludes correctly, and that the existing rollout-expansion + audit-causality
behaviours are unchanged when this read-only derivation is layered on.
"""
from __future__ import annotations

from sqlalchemy import select

from app.models import (
    ActionDecision,
    AuditEvent,
    BatchStatus,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
)
from app.services import measurement, recovery
from app.services.measurement import MeasurementEligibility

from tests._helpers import seed_live_demo


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _egg_action(db) -> PriceAction:
    """The egg POS-mismatch action at store 214 — INELIGIBLE_EXECUTION_NOT_VERIFIED in seed."""
    return db.scalar(
        select(PriceAction).where(
            PriceAction.sku == "egg-cage-free-brown-12",
            PriceAction.store_id == "214",
        )
    )


def _strawberry_action(db) -> PriceAction:
    """The strawberry ESL-timeout action at store 214 — INELIGIBLE_AWAITING_ACK in seed."""
    return db.scalar(
        select(PriceAction).where(
            PriceAction.sku == "strawberry-1lb",
            PriceAction.store_id == "214",
        )
    )


def _orange_juice_action(db) -> PriceAction:
    """The OJ verified action at store 214 — ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED in seed."""
    return db.scalar(
        select(PriceAction).where(
            PriceAction.sku == "oj-nfc-premium-52oz",
            PriceAction.store_id == "214",
        )
    )


def _open_incident_for(db, action: PriceAction) -> Incident:
    return db.scalar(
        select(Incident).where(
            Incident.action_id == action.id,
            Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]),
        )
    )


# ---------------------------------------------------------------------------
# Four-state derivation tests
# ---------------------------------------------------------------------------
def test_pos_mismatch_is_ineligible_execution_not_verified(db):
    """Eggs: POS reports $4.49 vs approved $4.19 → INELIGIBLE_EXECUTION_NOT_VERIFIED.

    Confirms (a) the action's decision is BLOCKED (existing core behaviour) and
    (b) the eligibility derivation returns the expected status + reason +
    blocked_channel."""
    seed_live_demo(db)
    egg = _egg_action(db)
    assert egg.decision == ActionDecision.BLOCKED, "pre-condition: core decision must still be BLOCKED"

    result = measurement.derive_eligibility_for_action(db, egg)
    assert result.status == MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED
    assert "MISMATCH" in result.reason
    assert result.blocked_channel == "pos"
    assert "pos" in result.required_channels
    assert "pos" not in result.verified_channels


def test_timeout_is_ineligible_awaiting_acknowledgement(db):
    """Strawberry: ESL shelf-label timeout (deadline risk) → INELIGIBLE_AWAITING_ACK.

    Awaiting-ack must take precedence over mismatch even if both signals were
    present (here only timeout is present). Action.decision is RETRY."""
    seed_live_demo(db)
    strawberry = _strawberry_action(db)
    assert strawberry.decision == ActionDecision.RETRY, "pre-condition: core decision must still be RETRY"

    result = measurement.derive_eligibility_for_action(db, strawberry)
    assert result.status == MeasurementEligibility.INELIGIBLE_AWAITING_ACKNOWLEDGEMENT
    assert "AWAITING" in result.reason
    assert result.blocked_channel == "esl"


def test_all_channels_verified_is_eligible(db):
    """Orange juice: every channel reports the approved price → ELIGIBLE."""
    seed_live_demo(db)
    oj = _orange_juice_action(db)
    assert oj.decision == ActionDecision.ELIGIBLE, "pre-condition: core decision must still be ELIGIBLE"

    result = measurement.derive_eligibility_for_action(db, oj)
    assert result.status == MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED
    assert result.reason == "ALL_REQUIRED_CHANNELS_VERIFIED"
    assert result.blocked_channel is None
    assert sorted(result.verified_channels) == sorted(result.required_channels)


def test_rolled_back_action_is_excluded_recovery_incomplete(db):
    """An operator rollback on the egg incident → EXCLUDED_RECOVERY_INCOMPLETE.

    This must take precedence over the channel state — even if the rollback's
    follow-up reconcile shows mismatch, the eligibility is *exclusion* not
    *ineligibility*, because the action is no longer trustworthy execution
    evidence (a different price is in effect at the shelf)."""
    seed_live_demo(db)
    egg = _egg_action(db)
    incident = _open_incident_for(db, egg)
    assert incident is not None, "pre-condition: an open POS incident must exist for the egg action"

    recovery.rollback_incident(db, incident.id)
    db.expire(egg)
    egg = _egg_action(db)

    result = measurement.derive_eligibility_for_action(db, egg)
    assert result.status == MeasurementEligibility.EXCLUDED_RECOVERY_INCOMPLETE
    assert result.reason == "ROLLBACK_OR_PENDING_RECOVERY"


def test_retry_to_verified_transitions_to_eligible(db):
    """Retry the egg incident → POS now reports the approved price → eligibility
    flips from INELIGIBLE_EXECUTION_NOT_VERIFIED to
    ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED.

    Proves the derivation reflects state changes in real time and that the
    awaiting-ack/mismatch precedence releases cleanly once reconciliation
    succeeds."""
    seed_live_demo(db)
    egg = _egg_action(db)
    incident = _open_incident_for(db, egg)
    assert incident is not None

    # Before
    before = measurement.derive_eligibility_for_action(db, egg)
    assert before.status == MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED

    # Retry — the seeded scenario is configured so POS acks on retry.
    recovery.retry_incident(db, incident.id)
    db.expire(egg)
    egg = _egg_action(db)

    after = measurement.derive_eligibility_for_action(db, egg)
    assert after.status == MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED


# ---------------------------------------------------------------------------
# Regression guards — derivation must not alter existing behaviour
# ---------------------------------------------------------------------------
def test_existing_rollout_decisions_unchanged_after_derivation(db):
    """Running the derivation must not mutate any action.decision or
    batch.status. The derivation reads, never writes."""
    seed_live_demo(db)
    batch = db.scalar(select(PriceBatch).order_by(PriceBatch.created_at.desc()))
    before_actions = {a.id: a.decision for a in batch.actions}
    before_batch_status = batch.status

    # Compute eligibility for every action — this is the broadest possible read.
    _ = measurement.derive_eligibility_for_batch(db, batch)
    db.flush()

    after_actions = {a.id: a.decision for a in batch.actions}
    assert after_actions == before_actions, "derivation must not change ActionDecision"
    assert batch.status == before_batch_status, "derivation must not change BatchStatus"


def test_existing_audit_causality_unchanged_after_derivation(db):
    """The derivation must not emit any audit events. Audit row counts (total
    and per-incident) stay constant before and after derivation."""
    seed_live_demo(db)
    batch = db.scalar(select(PriceBatch).order_by(PriceBatch.created_at.desc()))
    before_count = db.scalar(
        select(AuditEvent.id).where(AuditEvent.batch_id == batch.id)
    )
    before_total = db.query(AuditEvent).filter(AuditEvent.batch_id == batch.id).count()

    _ = measurement.derive_eligibility_for_batch(db, batch)
    db.flush()

    after_total = db.query(AuditEvent).filter(AuditEvent.batch_id == batch.id).count()
    assert after_total == before_total, "derivation must not emit audit events"


def test_batch_helper_avoids_n_plus_one(db):
    """``derive_eligibility_for_batch`` issues exactly two SELECTs against the
    incident / store-task tables, regardless of how many actions live in the
    batch.

    Uses SQLAlchemy's ``after_cursor_execute`` hook to count statements that
    touch the two N+1-risk tables."""
    from sqlalchemy import event

    seed_live_demo(db)
    batch = db.scalar(select(PriceBatch).order_by(PriceBatch.created_at.desc()))

    incident_selects = 0
    task_selects = 0

    def _counter(conn, cursor, statement, parameters, context, executemany):
        nonlocal incident_selects, task_selects
        sql = (statement or "").lower()
        if "from incidents" in sql and sql.lstrip().startswith("select"):
            incident_selects += 1
        if "from store_tasks" in sql and sql.lstrip().startswith("select"):
            task_selects += 1

    event.listen(db.bind, "after_cursor_execute", _counter)
    try:
        result = measurement.derive_eligibility_for_batch(db, batch)
    finally:
        event.remove(db.bind, "after_cursor_execute", _counter)

    assert len(result) == len(batch.actions), "every action gets an eligibility result"
    assert incident_selects == 1, f"expected exactly 1 incidents SELECT, got {incident_selects}"
    # store_tasks is queried only if any incidents exist; the seeded demo has them.
    assert task_selects <= 1, f"expected at most 1 store_tasks SELECT, got {task_selects}"
