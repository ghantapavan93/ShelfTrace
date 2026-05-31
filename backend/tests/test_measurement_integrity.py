"""Batch-level measurement-integrity rollup — derivation tests + endpoint contract.

Locks the affected-cohort split (verified-affected vs execution-failed), the
verified-rate math, the breakdown shape, the deterministic summary line, and
the div-by-zero guard against the seeded Memorial Day world. Also exercises the
explicit ``/operations/measurement-integrity`` endpoint end-to-end: scope
resolution, the 404 contract, and the backward-compatible field on
``/operations``.

Seed reality (Memorial Day live batch = 3 products × 4 stores = 12 actions;
canary = 214, 302; only canary actions reconcile, expansion actions stay
PENDING → default-safe INELIGIBLE_EXECUTION_NOT_VERIFIED):

    total_affected     = 12
    verified_affected  = 4   (ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED)
    execution_failed   = 8   (7 mismatch + 1 awaiting ack)
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import BatchStatus, PriceBatch, RunMode
from app.seed import DEMO_EXTERNAL_ID, seed_live
from app.services import measurement
from app.services.measurement import MeasurementEligibility

# Ground-truth counts for the seeded Memorial Day live batch (see module docstring).
SEED_TOTAL = 12
SEED_VERIFIED = 4
SEED_FAILED = 8
SEED_MISMATCH = 7
SEED_AWAITING = 1


# ---------------------------------------------------------------------------
# Pure aggregation
# ---------------------------------------------------------------------------
def test_summary_counts_match_seeded_live_batch(db):
    """total/verified/failed reflect the seeded Memorial Day reality."""
    batch = seed_live(db)
    s = measurement.summarize_batch_integrity(db, batch)
    assert s.total_affected == SEED_TOTAL
    assert s.verified_affected == SEED_VERIFIED
    assert s.execution_failed == SEED_FAILED
    # The two halves partition the cohort exactly.
    assert s.verified_affected + s.execution_failed == s.total_affected


def test_verified_rate_is_verified_over_total(db):
    batch = seed_live(db)
    s = measurement.summarize_batch_integrity(db, batch)
    assert s.verified_rate == SEED_VERIFIED / SEED_TOTAL


def test_breakdown_keys_and_counts(db):
    """Breakdown is keyed by every eligibility value (zero-filled) and the per
    status counts match the seed; the failed buckets sum to execution_failed."""
    batch = seed_live(db)
    s = measurement.summarize_batch_integrity(db, batch)

    assert set(s.breakdown.keys()) == {e.value for e in MeasurementEligibility}
    assert (
        s.breakdown[MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED.value]
        == SEED_VERIFIED
    )
    assert (
        s.breakdown[MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED.value]
        == SEED_MISMATCH
    )
    assert (
        s.breakdown[MeasurementEligibility.INELIGIBLE_AWAITING_ACKNOWLEDGEMENT.value]
        == SEED_AWAITING
    )
    assert s.breakdown[MeasurementEligibility.EXCLUDED_RECOVERY_INCOMPLETE.value] == 0

    failed_keys = (
        MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED.value,
        MeasurementEligibility.INELIGIBLE_AWAITING_ACKNOWLEDGEMENT.value,
        MeasurementEligibility.EXCLUDED_RECOVERY_INCOMPLETE.value,
    )
    assert sum(s.breakdown[k] for k in failed_keys) == s.execution_failed
    # Every action is counted exactly once.
    assert sum(s.breakdown.values()) == s.total_affected


def test_summary_line_is_deterministic_from_counts(db):
    """The summary is assembled from counts only — failure kinds listed in
    precedence order (mismatch, awaiting ack, recovery), zeros omitted."""
    batch = seed_live(db)
    s = measurement.summarize_batch_integrity(db, batch)
    assert s.summary == (
        "4 of 12 affected actions verified across all channels; "
        "8 excluded from measurement (7 mismatch, 1 awaiting ack)."
    )


def test_to_dict_round_trips_shape(db):
    batch = seed_live(db)
    payload = measurement.summarize_batch_integrity(db, batch).to_dict()
    assert set(payload.keys()) == {
        "total_affected",
        "verified_affected",
        "execution_failed",
        "verified_rate",
        "breakdown",
        "summary",
    }
    # to_dict returns copies, not the live containers.
    assert payload["breakdown"] is not None


def test_empty_batch_div_by_zero_guard(db):
    """A batch with no actions must not raise — verified_rate guards to 0.0 and
    the breakdown is fully zero-filled with the fixed empty summary."""
    batch = PriceBatch(
        id="batch_empty_integrity",
        external_id="empty-integrity-batch",
        idempotency_key="idem-empty-integrity",
        name="Empty",
        zone="Nowhere",
        status=BatchStatus.RECEIVED,
        run_mode=RunMode.LIVE_ROLLOUT,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    s = measurement.summarize_batch_integrity(db, batch)
    assert s.total_affected == 0
    assert s.verified_affected == 0
    assert s.execution_failed == 0
    assert s.verified_rate == 0.0
    assert all(v == 0 for v in s.breakdown.values())
    assert set(s.breakdown.keys()) == {e.value for e in MeasurementEligibility}
    assert s.summary == "no affected actions in this batch."


def test_derivation_emits_no_audit_events(db):
    """Pure derivation: summarizing must not write audit rows (discipline rule —
    read-only, no new write paths)."""
    from app.models import AuditEvent

    batch = seed_live(db)
    before = db.query(AuditEvent).filter(AuditEvent.batch_id == batch.id).count()
    measurement.summarize_batch_integrity(db, batch)
    db.flush()
    after = db.query(AuditEvent).filter(AuditEvent.batch_id == batch.id).count()
    assert after == before


# ---------------------------------------------------------------------------
# Endpoint: scope resolution + 404 contract + shape
# ---------------------------------------------------------------------------
def test_endpoint_demo_scope_returns_seeded_rollup(db):
    """The seed lands as scope 'demo:memorial-day' → scope=demo returns it."""
    seed_live(db)
    client = TestClient(app)
    resp = client.get("/api/v1/operations/measurement-integrity?scope=demo")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_affected"] == SEED_TOTAL
    assert body["verified_affected"] == SEED_VERIFIED
    assert body["execution_failed"] == SEED_FAILED
    assert body["verified_rate"] == SEED_VERIFIED / SEED_TOTAL
    assert set(body["breakdown"].keys()) == {e.value for e in MeasurementEligibility}
    assert isinstance(body["summary"], str) and body["summary"]


def test_endpoint_default_scope_returns_rollup(db):
    """No scope → Scope.ALL → the seeded batch is the latest live-rollout batch."""
    seed_live(db)
    client = TestClient(app)
    resp = client.get("/api/v1/operations/measurement-integrity")
    assert resp.status_code == 200
    assert resp.json()["total_affected"] == SEED_TOTAL


def test_endpoint_live_scope_empty_is_404(db):
    """The seeded batch is demo-scoped. A live-scope request with no user batch
    must 404 (the exact contract /operations enforces), not cross the boundary."""
    seed_live(db)
    client = TestClient(app)
    resp = client.get("/api/v1/operations/measurement-integrity?scope=live")
    assert resp.status_code == 404


def test_endpoint_external_id_is_escape_hatch(db):
    """An explicit external_id bypasses scope — a Live-mode user can still
    inspect the seeded demo batch's rollup by direct id."""
    seed_live(db)
    client = TestClient(app)
    resp = client.get(
        f"/api/v1/operations/measurement-integrity"
        f"?external_id={DEMO_EXTERNAL_ID}&scope=live"
    )
    assert resp.status_code == 200
    assert resp.json()["total_affected"] == SEED_TOTAL


def test_endpoint_unknown_external_id_is_404(db):
    seed_live(db)
    client = TestClient(app)
    resp = client.get(
        "/api/v1/operations/measurement-integrity?external_id=does-not-exist"
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Backward compatibility: /operations still 200s and now carries the field
# ---------------------------------------------------------------------------
def test_operations_overview_includes_integrity_field(db):
    seed_live(db)
    client = TestClient(app)
    resp = client.get("/api/v1/operations")
    assert resp.status_code == 200
    body = resp.json()
    assert "measurement_integrity" in body
    integrity = body["measurement_integrity"]
    assert integrity is not None
    assert integrity["total_affected"] == SEED_TOTAL
    assert integrity["verified_affected"] == SEED_VERIFIED
    assert integrity["execution_failed"] == SEED_FAILED
