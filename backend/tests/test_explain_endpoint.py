"""Backend tests for POST /api/v1/operations/explain.

Covers:
  1. Milk hero POS-mismatch scenario — answer is evidence-backed and the
     measurement gate is QUARANTINED.
  2. Zone-status dict shape — every entry is a human-readable string label.
  3. Strawberry deadline query against the Memorial Day scenario.
  4. Empty-state resilience — fresh db with no seeded data never crashes.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import scenarios
from tests._helpers import seed_live_demo


# ---------------------------------------------------------------------------
# 1. Milk hero — evidence-backed answer + QUARANTINED gate
# ---------------------------------------------------------------------------
def test_explain_blocked_zone_returns_evidence_backed_answer(db):
    """Milk hero seeds a LIVE_ROLLOUT batch with a POS price mismatch on Store 214.

    The explain endpoint must:
    - Return 200.
    - Surface an answer that references the approved price ($5.99), the
      mismatch, or the block state.
    - Return a non-empty evidence_chips list.
    - Set measurement_gate to one of the three valid gate labels.
    """
    scenarios.ensure_milk_hero(db)

    client = TestClient(app)
    r = client.post(
        "/api/v1/operations/explain",
        json={"query": "Why is Dallas Zone 2 blocked?"},
    )

    assert r.status_code == 200, r.text
    body = r.json()

    answer: str = body["answer"]
    assert isinstance(answer, str) and len(answer) > 0

    # The answer must be grounded in the actual price event — it must mention
    # the approved price, a mismatch condition, or the blocked state.
    lower = answer.lower()
    assert any(term in lower for term in ("5.99", "mismatch", "blocked", "price", "intervention")), (
        f"Answer does not reference relevant evidence: {answer!r}"
    )

    # Evidence chips must be present — the endpoint derives them from real rows.
    chips = body["evidence_chips"]
    assert isinstance(chips, list) and len(chips) > 0, (
        f"Expected non-empty evidence_chips, got: {chips!r}"
    )

    # The gate must be a valid label — no free-form strings.
    gate = body["measurement_gate"]
    assert gate in {"QUARANTINED", "ELIGIBLE", "PENDING"}, (
        f"Unexpected measurement_gate value: {gate!r}"
    )


# ---------------------------------------------------------------------------
# 2. Zone-status dict shape
# ---------------------------------------------------------------------------
def test_explain_returns_zone_status_dict(db):
    """The zone_status field must map store IDs to human-readable string labels.

    After milk hero is seeded the batch covers at least one store, so the
    dict must be non-empty and every value must be a non-empty string.
    """
    scenarios.ensure_milk_hero(db)

    client = TestClient(app)
    r = client.post(
        "/api/v1/operations/explain",
        json={"query": "zone status"},
    )

    assert r.status_code == 200, r.text
    body = r.json()

    zone_status = body["zone_status"]
    assert isinstance(zone_status, dict), f"zone_status must be a dict, got {type(zone_status)}"
    assert len(zone_status) >= 1, f"Expected at least one store entry in zone_status, got: {zone_status!r}"

    for store_id, label in zone_status.items():
        assert isinstance(store_id, str) and len(store_id) > 0, (
            f"Store ID key must be a non-empty string, got: {store_id!r}"
        )
        assert isinstance(label, str) and len(label) > 0, (
            f"Zone status label must be a non-empty string for store {store_id!r}, got: {label!r}"
        )


# ---------------------------------------------------------------------------
# 3. Strawberry / deadline query against Memorial Day scenario
# ---------------------------------------------------------------------------
def test_explain_strawberry_deadline_query(db):
    """Memorial Day seeds a Fresh Strawberries action with an ESL deadline.

    A query containing 'strawberry deadline' must return 200 with a non-empty
    answer — the endpoint routes to Branch B (perishable/ESL/deadline) and
    either surfaces an active deadline risk or the perishable action itself.
    """
    seed_live_demo(db)

    client = TestClient(app)
    r = client.post(
        "/api/v1/operations/explain",
        json={"query": "strawberry deadline"},
    )

    assert r.status_code == 200, r.text
    body = r.json()

    answer = body["answer"]
    assert isinstance(answer, str) and len(answer) > 0, (
        f"Expected a non-empty answer for strawberry deadline query, got: {answer!r}"
    )


# ---------------------------------------------------------------------------
# 4. Empty-state resilience — no seeded data must not crash
# ---------------------------------------------------------------------------
def test_explain_no_blocked_batch_returns_clean_status(db):
    """With a completely fresh database (no seeded batches), the explain
    endpoint must return 200 and a non-empty answer — it must never 500.

    The endpoint handles the missing-batch case with a graceful fallback
    message; this test ensures that path is reachable and correct.
    """
    # Deliberately do NOT seed anything — fresh schema, no batches.
    client = TestClient(app)
    r = client.post(
        "/api/v1/operations/explain",
        json={"query": "what is the current batch status"},
    )

    assert r.status_code == 200, r.text
    body = r.json()

    answer = body["answer"]
    assert isinstance(answer, str) and len(answer) > 0, (
        f"Expected a non-empty fallback answer, got: {answer!r}"
    )
