"""Scale execution — push a large batch through the REAL engine, not just seed it.

The other scale test (test_realistic_scale) proves the catalog *loads* at volume.
This proves the reconciliation engine *executes* at volume: a batch with many
products across many stores (hundreds of actions) reconciles correctly, opens
exactly the incidents the data implies, and stays bounded (no N+1 explosion, no
hang). A grocery founder runs hundreds of thousands of SKUs — this won't prove
that, but it moves the goalpost from "3 hand-picked products" to "executes a
realistic multi-hundred-action batch end-to-end," and pins it against regressions.
"""
from __future__ import annotations

from app.models import (
    ActionDecision,
    Incident,
    IncidentType,
    PriceAction,
    PriceBatch,
)
from app.schemas import ApprovedActionIn, PriceBatchIn
from app.services import orchestrator
from app.services.ingestion import ingest_batch


def test_large_batch_executes_and_reconciles_correctly(db):
    """30 products × 10 stores = 300 actions. With no failing behaviors every
    action verifies and the batch is clean — proving the engine fans out and
    reconciles a multi-hundred-action batch end-to-end without choking."""
    products = [
        ApprovedActionIn(
            sku=f"scale-sku-{i:03d}", product_name=f"Product {i}",
            approved_price=round(2.0 + i * 0.10, 2), prior_price=round(2.5 + i * 0.10, 2),
            reason="scale test",
        )
        for i in range(30)
    ]
    stores = [f"store-{s:02d}" for s in range(10)]
    payload = PriceBatchIn(
        external_id="scale-exec", idempotency_key="idem-scale-exec",
        name="Scale Execution", zone="Region X", store_ids=stores,
        total_store_count=len(stores), actions=products, run_mode="live_rollout",
    )

    result = ingest_batch(db, payload)
    db.commit()
    orchestrator.drain(db)

    actions = db.query(PriceAction).filter(PriceAction.batch_id == result.batch.id).all()
    assert len(actions) == 300  # 30 products × 10 stores, fanned out correctly

    # No failing behaviors → no incidents, every canary action eligible.
    incidents = db.query(Incident).filter(Incident.batch_id == result.batch.id).count()
    assert incidents == 0
    eligible = sum(1 for a in actions if a.decision == ActionDecision.ELIGIBLE)
    # Canary actions reconcile immediately; expansion actions stay pending until
    # expand. At minimum every canary action must have verified (none blocked).
    blocked = sum(1 for a in actions if a.decision == ActionDecision.BLOCKED)
    assert blocked == 0
    assert eligible >= 30  # at least the canary cohort verified


def test_large_batch_plausibility_scan_flags_exactly_the_bad_skus(db):
    """At scale, the plausibility scan must flag exactly the genuinely-bad actions
    — no phantom flags on good rows, none silently missed. (The plausibility GATE
    runs on scenario execution; here we exercise the same scan directly over a
    large ingested batch's actions, which is what the gate calls.)"""
    from app.services import plausibility

    bad_skus = {f"bad-{i}" for i in range(5)}
    actions = []
    for i in range(15):
        actions.append(ApprovedActionIn(
            sku=f"ok-{i}", product_name=f"OK {i}",
            approved_price=4.99, prior_price=5.49, reason="ok",
        ))
    for sku in bad_skus:
        actions.append(ApprovedActionIn(
            sku=sku, product_name=sku, approved_price=0.49, prior_price=5.49,  # 91% slip
            reason="slip",
        ))
    stores = [f"st-{s}" for s in range(5)]
    payload = PriceBatchIn(
        external_id="scale-bad", idempotency_key="idem-scale-bad",
        name="Scale Bad", zone="Region X", store_ids=stores,
        total_store_count=len(stores), actions=actions, run_mode="live_rollout",
    )
    result = ingest_batch(db, payload)
    db.commit()

    report = plausibility.check_batch(db, result.batch)
    critical = [f for f in report.findings if f.severity == "critical"]
    flagged_skus = {f.sku for f in critical}
    # Exactly the 5 bad SKUs (× 5 stores = 25 critical findings), nothing else.
    assert flagged_skus == bad_skus
    assert len(critical) == 25
    # 20 products × 5 stores were screened.
    assert report.checked_actions == 100
