"""Override Memory / Regression Replay.

A resolved failure becomes durable, replayable protection. These tests prove:

  * A regression case is captured from a *real* incident, with case_type
    auto-derived from the incident type and title/expected/failure-signature
    built from real row data.
  * Capture is idempotent on the originating incident.
  * The Decision Receipt's Learned stage flips to ``verified`` and surfaces the
    saved case title once a case exists for the action (the real durable
    reference, replacing the narrative hint).
  * Replay re-exercises the failure signature through the SHARED certification
    engine, marks the case REPLAYED with last_replayed_at, and writes audit.
  * The HTTP surface exposes list / get / create-from-incident / replay.
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import (
    AuditEvent,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
    RegressionCase,
    RegressionCaseStatus,
    RegressionCaseType,
)
from app.services import receipt, regression

from tests._helpers import seed_live_demo


def _egg(db) -> PriceAction:
    return db.scalar(
        select(PriceAction).where(
            PriceAction.sku == "egg-cage-free-brown-12", PriceAction.store_id == "214"
        )
    )


def _egg_incident(db) -> Incident:
    egg = _egg(db)
    return db.scalar(
        select(Incident).where(
            Incident.action_id == egg.id, Incident.type == IncidentType.PRICE_MISMATCH
        )
    )


def _stage(rcpt, key):
    return next(s for s in rcpt.stages if s.key == key)


# ---------------------------------------------------------------------------
# Capture from a real incident
# ---------------------------------------------------------------------------
def test_capture_from_incident_uses_real_row_data(db):
    seed_live_demo(db)
    incident = _egg_incident(db)
    egg = _egg(db)

    case = regression.create_from_incident(db, incident.id)

    assert case.case_type == RegressionCaseType.CONNECTOR_CERTIFICATION
    assert case.status == RegressionCaseStatus.ACTIVE
    assert case.origin_incident_id == incident.id
    assert case.origin_action_id == egg.id
    assert case.sku == egg.sku
    assert case.store_id == egg.store_id
    assert case.channel == "pos"
    # Failure signature reflects the real observed-vs-approved mismatch.
    assert f"${egg.approved_price:.2f}" in case.failure_signature
    assert "POS" in case.expected_behavior
    # A capture writes an audit event.
    assert (
        db.scalar(
            select(AuditEvent).where(
                AuditEvent.incident_id == incident.id,
                AuditEvent.event == "Regression case captured",
            )
        )
        is not None
    )


def test_capture_is_idempotent_per_incident(db):
    seed_live_demo(db)
    incident = _egg_incident(db)

    first = regression.create_from_incident(db, incident.id)
    second = regression.create_from_incident(db, incident.id)

    assert first.id == second.id
    assert db.scalar(select(RegressionCase).where(RegressionCase.origin_incident_id == incident.id))
    assert len(regression.list_cases(db)) == 1


def test_capture_unknown_incident_raises(db):
    seed_live_demo(db)
    try:
        regression.create_from_incident(db, "does-not-exist")
        assert False, "expected RegressionError"
    except regression.RegressionError:
        pass


# ---------------------------------------------------------------------------
# Receipt Learned stage wiring — references the real saved row
# ---------------------------------------------------------------------------
def test_learned_stage_references_saved_case(db):
    seed_live_demo(db)
    incident = _egg_incident(db)
    egg = _egg(db)

    # Before capture: the narrative behaviour (no durable case).
    before = receipt.decision_receipt(db, egg)
    assert not any(
        e.label.startswith("Regression case") for e in _stage(before, "learned").evidence
    )

    case = regression.create_from_incident(db, incident.id)

    after = receipt.decision_receipt(db, egg)
    learned = _stage(after, "learned")
    assert learned.state == "verified"
    assert any(e.value == case.title for e in learned.evidence)
    assert "regression case" in learned.headline.lower()


# ---------------------------------------------------------------------------
# Replay through the shared certification engine
# ---------------------------------------------------------------------------
def test_replay_runs_through_certification_engine(db):
    seed_live_demo(db)
    incident = _egg_incident(db)
    case = regression.create_from_incident(db, incident.id)

    result = regression.replay_as_certification(db, case.id)

    assert result["case_id"] == case.id
    assert result["certification_run_id"] is not None
    assert result["redirect"] == "/certification"
    # The POS mismatch heals on the remediation path the replay drives.
    assert result["healed"] is True

    db.refresh(case)
    assert case.status == RegressionCaseStatus.REPLAYED
    assert case.last_replayed_at is not None
    # Replay writes an audit event.
    assert (
        db.scalar(
            select(AuditEvent).where(AuditEvent.event == "Regression case replayed")
        )
        is not None
    )


def test_replay_unknown_case_raises(db):
    seed_live_demo(db)
    try:
        regression.replay_as_certification(db, "rc_missing")
        assert False, "expected RegressionError"
    except regression.RegressionError:
        pass


# ---------------------------------------------------------------------------
# HTTP surface
# ---------------------------------------------------------------------------
def test_http_surface(db):
    seed_live_demo(db)
    incident = _egg_incident(db)
    client = TestClient(app)

    # Empty to start.
    assert client.get("/api/v1/regression-cases").json() == []

    created = client.post(f"/api/v1/incidents/{incident.id}/create-regression-case")
    assert created.status_code == 200
    case_id = created.json()["id"]
    assert created.json()["case_type"] == "connector_certification"
    assert created.json()["status"] == "active"

    listed = client.get("/api/v1/regression-cases").json()
    assert len(listed) == 1 and listed[0]["id"] == case_id

    one = client.get(f"/api/v1/regression-cases/{case_id}")
    assert one.status_code == 200 and one.json()["id"] == case_id
    assert client.get("/api/v1/regression-cases/nope").status_code == 404

    # Create from a missing incident → 404.
    assert (
        client.post("/api/v1/incidents/nope/create-regression-case").status_code == 404
    )

    replay = client.post(f"/api/v1/regression-cases/{case_id}/replay")
    assert replay.status_code == 200
    body = replay.json()
    assert body["case_id"] == case_id
    assert body["status"] == "replayed"
    assert body["certification_run_id"] is not None
    assert client.post("/api/v1/regression-cases/nope/replay").status_code == 404
