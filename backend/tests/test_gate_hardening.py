"""Plausibility-gate hardening — regression guards for the gate-defeat and
un-gated-ingest-path bugs surfaced in the deep backend audit.

The plausibility gate holds a batch when an approved price looks like a DATA
ERROR (decimal slip, below-cost, cross-store outlier). Three doors were found
that could let a held price escape:

  1. The REST ingest path (POST /price-batches) never ran the gate at all — only
     the scenario execute_live() path did. A machine-to-machine caller could push
     a decimal slip straight through.
  2. complete_store_task() re-reconciles the action; with every channel agreeing
     on the wrong number, that flipped the held action to ELIGIBLE and resolved
     the implausible incident — defeating the gate in one click.
  3. After an operator rollback, re-reconciling the action flipped its decision
     back out of BLOCKED for the same reason.

All three are now closed at a single enforcement point in reconcile_action plus
the gate call on the REST route. These tests prove each door is shut.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    ActionDecision,
    BatchStatus,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
)
from app.schemas import ScenarioActionIn, ScenarioIn
from app.services import reconciliation, recovery, scenarios


def _implausible_batch(db, sku: str, name: str) -> PriceBatch:
    """Execute a single-store decimal-slip ($4.90 typed $0.49) batch via the
    scenario path. With no behaviors, every channel agrees on the wrong price, so
    only the plausibility gate — not a channel mismatch — holds it."""
    payload = ScenarioIn(
        name=name,
        run_mode="live_rollout",
        zone_name="Region 7",
        store_ids=["store-A"],
        canary_store_ids=["store-A"],
        actions=[
            ScenarioActionIn(
                product_name="Organic Whole Milk 1gal",
                sku=sku,
                previous_price=4.90,
                approved_price=0.49,
            )
        ],
        behaviors=[],
    )
    cfg = scenarios.create_config(db, payload)
    return scenarios.execute_live(db, cfg)


def test_price_batches_rest_path_gates_implausible_price(db):
    """The gate must guard the machine-to-machine REST ingest path, not just the
    scenario UI. A decimal slip POSTed to /api/v1/price-batches opens an
    IMPLAUSIBLE_PRICE incident and HOLDS the batch. (Audit P0: un-gated ingest.)"""
    client = TestClient(app)
    resp = client.post(
        "/api/v1/price-batches",
        json={
            "external_id": "rest-slip-01",
            "idempotency_key": "idem-rest-slip-01",
            "name": "REST Decimal Slip",
            "zone": "Region 7",
            "total_store_count": 1,
            "store_ids": ["store-A"],
            "actions": [
                {
                    "sku": "milk-rest-slip",
                    "product_name": "Organic Whole Milk 1gal",
                    "approved_price": 0.49,
                    "prior_price": 4.90,
                    "reason": "weekly ad",
                }
            ],
        },
    )
    assert resp.status_code == 202

    batch = db.query(PriceBatch).filter(PriceBatch.external_id == "rest-slip-01").one()
    # The batch is HELD by the gate on the REST path — exactly as execute_live would.
    assert batch.status == BatchStatus.BLOCKED
    implausible = (
        db.query(Incident)
        .filter(Incident.batch_id == batch.id, Incident.type == IncidentType.IMPLAUSIBLE_PRICE)
        .all()
    )
    assert len(implausible) == 1
    assert implausible[0].severity.value == "critical"
    action = db.query(PriceAction).filter(PriceAction.batch_id == batch.id).one()
    assert action.decision == ActionDecision.BLOCKED


def test_implausible_gate_survives_store_task_completion(db):
    """Completing a store-verification task must NOT clear an implausible-price
    hold. complete_store_task re-reconciles the action; with channels agreeing on
    the wrong number this previously flipped it to ELIGIBLE and resolved the
    incident. The hold must survive. (Audit P0: gate-defeat via store task.)"""
    batch = _implausible_batch(db, sku="milk-slip-task", name="Slip Task Guard")
    inc = (
        db.query(Incident)
        .filter(Incident.batch_id == batch.id, Incident.type == IncidentType.IMPLAUSIBLE_PRICE)
        .one()
    )
    action = db.query(PriceAction).filter(PriceAction.batch_id == batch.id).one()
    assert action.decision == ActionDecision.BLOCKED

    # Open and complete a store task — the previously-unguarded door.
    recovery.create_store_task(db, inc.id, actor="reviewer")
    recovery.complete_store_task(db, inc.id, actor="reviewer")

    db.refresh(inc)
    db.refresh(action)
    db.refresh(batch)
    # The gate holds: incident not resolved, action still blocked, batch still held.
    assert inc.status != IncidentStatus.RESOLVED
    assert action.decision == ActionDecision.BLOCKED
    assert batch.status == BatchStatus.BLOCKED


def test_rolled_back_implausible_action_cannot_become_eligible(db):
    """After an operator rolls back, re-reconciling the action must not flip it
    back to ELIGIBLE just because channels agree on the (still-wrong) price. A
    rollback is an operator hold; only an upstream correction clears it.
    (Audit P1: rolled-back action decision flip.)"""
    batch = _implausible_batch(db, sku="milk-slip-rb", name="Slip Rollback Guard")
    inc = (
        db.query(Incident)
        .filter(Incident.batch_id == batch.id, Incident.type == IncidentType.IMPLAUSIBLE_PRICE)
        .one()
    )
    action = db.query(PriceAction).filter(PriceAction.batch_id == batch.id).one()

    recovery.rollback_incident(db, inc.id, actor="reviewer")
    db.refresh(inc)
    db.refresh(action)
    assert inc.status == IncidentStatus.ROLLED_BACK
    assert action.decision == ActionDecision.BLOCKED

    # Re-reconcile (e.g. a re-drained RECONCILE event): channels still "agree" on
    # $0.49, but the rollback hold pins the decision to BLOCKED.
    decision = reconciliation.reconcile_action(db, action)
    assert decision == ActionDecision.BLOCKED
    db.refresh(action)
    assert action.decision == ActionDecision.BLOCKED
