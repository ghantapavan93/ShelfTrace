"""Decision Receipt — the connective evidence chain for one price action.

These tests prove the receipt is a faithful, read-only projection of the
seeded Memorial Day demo state:

  * The rail always renders the eight canonical stages in order.
  * A clean action (orange juice) walks every stage with no break and is
    measurement-eligible.
  * A POS mismatch (eggs) breaks the chain at ``verified`` and quarantines
    measurement (``stopped_at_stage == "verified"``).
  * An ESL timeout (strawberry) is *awaiting* — soft, not failed.
  * An operator rollback excludes the action from measurement and the
    ``learned`` stage records the override.
  * Generating a receipt mutates nothing (no decision/status change, no new
    audit events) — identical discipline to the eligibility derivation.
  * The HTTP surface returns the receipt for an action id and (via the
    convenience route) for an incident id, and 404s cleanly.
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import (
    ActionDecision,
    AuditEvent,
    Incident,
    IncidentStatus,
    PriceAction,
    PriceBatch,
)
from app.services import measurement, receipt, recovery
from app.services.receipt import STAGE_ORDER

from tests._helpers import seed_live_demo


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _action(db, sku: str, store_id: str = "214") -> PriceAction:
    return db.scalar(
        select(PriceAction).where(PriceAction.sku == sku, PriceAction.store_id == store_id)
    )


def _egg(db):
    return _action(db, "egg-cage-free-brown-12")


def _strawberry(db):
    return _action(db, "strawberry-1lb")


def _orange_juice(db):
    return _action(db, "oj-nfc-premium-52oz")


def _open_incident_for(db, action) -> Incident:
    return db.scalar(
        select(Incident).where(
            Incident.action_id == action.id,
            Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]),
        )
    )


def _stage(rcpt, key):
    return next(s for s in rcpt.stages if s.key == key)


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------
def test_receipt_renders_eight_stages_in_canonical_order(db):
    seed_live_demo(db)
    rcpt = receipt.decision_receipt(db, _orange_juice(db))
    assert [s.key for s in rcpt.stages] == STAGE_ORDER
    assert len(rcpt.stages) == 8


# ---------------------------------------------------------------------------
# Clean action — the chain holds end to end
# ---------------------------------------------------------------------------
def test_eligible_action_walks_the_full_chain(db):
    """Orange juice verifies on every channel → no stage fails, measurement
    eligible, learned stage is a clean execution."""
    seed_live_demo(db)
    oj = _orange_juice(db)
    assert oj.decision == ActionDecision.ELIGIBLE

    rcpt = receipt.decision_receipt(db, oj)
    assert rcpt.outcome == "VERIFIED_ELIGIBLE"
    assert rcpt.stopped_at_stage is None
    assert _stage(rcpt, "verified").state == "verified"
    assert _stage(rcpt, "measured").state == "verified"
    assert _stage(rcpt, "learned").state == "verified"
    # The eligibility object is threaded through unchanged.
    assert (
        rcpt.measurement_eligibility.status
        == measurement.MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED.value
    )


# ---------------------------------------------------------------------------
# Hard failure — POS mismatch stops the rail and quarantines measurement
# ---------------------------------------------------------------------------
def test_pos_mismatch_stops_at_verified_and_quarantines(db):
    seed_live_demo(db)
    egg = _egg(db)
    assert egg.decision == ActionDecision.BLOCKED

    rcpt = receipt.decision_receipt(db, egg)
    assert rcpt.outcome == "EXECUTION_BLOCKED"
    assert rcpt.stopped_at_stage == "verified"
    assert _stage(rcpt, "verified").state == "failed"
    # Measurement is quarantined (failed), POS is the blocked channel.
    assert _stage(rcpt, "measured").state == "failed"
    assert rcpt.measurement_eligibility.blocked_channel == "pos"
    # Stages before the break are intact.
    assert _stage(rcpt, "signal").state == "verified"
    assert _stage(rcpt, "approved").state == "verified"
    assert _stage(rcpt, "published").state == "verified"


# ---------------------------------------------------------------------------
# Soft failure — ESL timeout is awaiting, not a hard stop
# ---------------------------------------------------------------------------
def test_esl_timeout_is_awaiting_not_failed(db):
    seed_live_demo(db)
    strawberry = _strawberry(db)
    assert strawberry.decision == ActionDecision.RETRY

    rcpt = receipt.decision_receipt(db, strawberry)
    assert rcpt.outcome == "AWAITING_ACKNOWLEDGEMENT"
    # A soft "awaiting" must NOT register as a hard stop.
    assert rcpt.stopped_at_stage is None
    assert _stage(rcpt, "verified").state == "active"
    assert _stage(rcpt, "measured").state == "pending"


# ---------------------------------------------------------------------------
# Rollback — excluded from measurement, override recorded in the learned stage
# ---------------------------------------------------------------------------
def test_rollback_excludes_and_records_override(db):
    seed_live_demo(db)
    egg = _egg(db)
    incident = _open_incident_for(db, egg)
    assert incident is not None

    recovery.rollback_incident(db, incident.id)
    db.expire(egg)
    egg = _egg(db)

    rcpt = receipt.decision_receipt(db, egg)
    assert rcpt.outcome == "EXCLUDED_RECOVERY"
    assert _stage(rcpt, "measured").state == "excluded"
    learned = _stage(rcpt, "learned")
    assert learned.state == "excluded"
    # The rollback override is surfaced as audit evidence on the learned stage.
    assert any("roll" in e.value.lower() for e in learned.evidence)
    # The receipt carries the full incident reference + audit trail.
    assert any(i.status == "rolled_back" for i in rcpt.incidents)
    assert any("roll" in a.event.lower() for a in rcpt.audit)


# ---------------------------------------------------------------------------
# Read-only discipline — the receipt mutates nothing
# ---------------------------------------------------------------------------
def test_receipt_is_read_only(db):
    seed_live_demo(db)
    batch = db.scalar(select(PriceBatch).order_by(PriceBatch.created_at.desc()))
    before_decisions = {a.id: a.decision for a in batch.actions}
    before_audit = db.query(AuditEvent).filter(AuditEvent.batch_id == batch.id).count()

    for a in batch.actions:
        _ = receipt.decision_receipt(db, a)
    db.flush()

    after_decisions = {a.id: a.decision for a in batch.actions}
    after_audit = db.query(AuditEvent).filter(AuditEvent.batch_id == batch.id).count()
    assert after_decisions == before_decisions, "receipt must not change any ActionDecision"
    assert after_audit == before_audit, "receipt must not emit audit events"


# ---------------------------------------------------------------------------
# HTTP surface
# ---------------------------------------------------------------------------
def test_action_receipt_endpoint(db):
    seed_live_demo(db)
    egg_id = _egg(db).id
    client = TestClient(app)

    body = client.get(f"/api/v1/actions/{egg_id}/receipt").json()
    assert body["action_id"] == egg_id
    assert body["outcome"] == "EXECUTION_BLOCKED"
    assert body["stopped_at_stage"] == "verified"
    assert [s["key"] for s in body["stages"]] == STAGE_ORDER

    assert client.get("/api/v1/actions/does-not-exist/receipt").status_code == 404


def test_incident_receipt_convenience_endpoint(db):
    seed_live_demo(db)
    egg = _egg(db)
    incident = _open_incident_for(db, egg)
    client = TestClient(app)

    body = client.get(f"/api/v1/incidents/{incident.id}/receipt").json()
    # The incident route resolves to the same action's receipt.
    assert body["action_id"] == egg.id
    assert body["outcome"] == "EXECUTION_BLOCKED"

    assert client.get("/api/v1/incidents/nope/receipt").status_code == 404
