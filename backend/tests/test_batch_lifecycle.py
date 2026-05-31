"""Extended Batch Lifecycle — Exported → Published → Verified → Measured.

A competitor pricing tool treats a batch as *done* at ``Exported``. The price's
real journey continues after export: it must publish to channels, get verified
per channel, and only then become measurement-eligible. ShelfTrace already
models that full per-ACTION rail (see :mod:`app.services.receipt`); this overlay
rolls it up to the BATCH level so a batch list/detail shows how far past
``Exported`` a whole batch actually got.

These tests prove the rollup is a faithful, read-only projection of the seeded
Memorial Day demo and never introduces a second source of truth for
published / verified / measured:

  * Stage counts match the seeded reality — 12 exported actions, only the 6
    canary actions published (expansion stores aren't dispatched yet), and the
    measured count equals the number of all-channels-VERIFIED actions.
  * The monotonic invariant holds: measured <= verified <= published <= total.
  * ``measured`` agrees exactly with ``derive_eligibility_for_batch`` and
    ``published`` agrees exactly with the receipt's ``action_published``
    predicate — no disagreement with the Decision Receipt is possible.
  * An empty batch is guarded (all-zero counts, no div-by-zero) and a batch
    with no canary deliveries reports zero published.
  * Computing the rollup mutates nothing.
  * Both HTTP surfaces (``GET /batches/{id}`` carrying the optional field, and
    the dedicated ``GET /batches/{id}/lifecycle`` route) return 200 with the
    right shape and 404 cleanly.
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.ids import new_id
from app.main import app
from app.models import (
    AuditEvent,
    BatchStatus,
    Environment,
    PriceAction,
    PriceBatch,
    RunMode,
)
from app.scope import DEMO_MEMORIAL_DAY
from app.seed import DEMO_EXTERNAL_ID
from app.services import measurement, queries
from app.services.measurement import MeasurementEligibility
from app.services.receipt import action_published

from tests._helpers import seed_live_demo


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _seeded_batch(db) -> PriceBatch:
    return db.scalar(select(PriceBatch).order_by(PriceBatch.created_at.desc()))


def _measured_count_via_eligibility(db, batch: PriceBatch) -> int:
    """Independent recount of measurement-eligible actions, straight from the
    eligibility derivation — the rollup must match this exactly."""
    elig = measurement.derive_eligibility_for_batch(db, batch)
    return sum(
        1
        for r in elig.values()
        if r.status == MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED
    )


def _verified_count_via_eligibility(db, batch: PriceBatch) -> int:
    elig = measurement.derive_eligibility_for_batch(db, batch)
    return sum(
        1
        for r in elig.values()
        if r.required_channels and len(r.verified_channels) == len(r.required_channels)
    )


# ---------------------------------------------------------------------------
# Rollup correctness against the seeded Memorial Day reality
# ---------------------------------------------------------------------------
def test_rollup_matches_seeded_memorial_day_reality(db):
    """4 stores x 3 products = 12 exported. Only the 6 canary actions (stores
    214 + 302) are dispatched; the expansion stores (317, 401) carry no
    deliveries yet — so they count toward exported but not published. That gap
    is exactly the post-export surface this overlay exists to show."""
    seed_live_demo(db)
    batch = _seeded_batch(db)

    life = queries.batch_lifecycle(db, batch)

    assert life.total == 12
    assert life.exported == 12
    assert life.exported == life.total
    # Canary = 214 + 302 = 6 actions, each with 3 channel deliveries.
    assert life.published == 6
    # Store 302 verifies all 3 products; store 214 only OJ verifies (egg POS
    # mismatch is BLOCKED, strawberry ESL timeout is RETRY). 3 + 1 = 4.
    assert life.verified == 4
    assert life.measured == 4


def test_measured_count_equals_all_channels_verified_actions(db):
    """``measured`` must equal the number of ELIGIBLE_ALL_REQUIRED_CHANNELS_
    VERIFIED actions from the eligibility derivation — one source of truth."""
    seed_live_demo(db)
    batch = _seeded_batch(db)

    life = queries.batch_lifecycle(db, batch)
    assert life.measured == _measured_count_via_eligibility(db, batch)
    assert life.verified == _verified_count_via_eligibility(db, batch)


def test_published_count_agrees_with_receipt_predicate(db):
    """``published`` must equal the count of actions for which the receipt's
    ``action_published`` predicate is true — the batch view reuses the SAME
    predicate the Decision Receipt's Published stage uses, so they can't drift."""
    seed_live_demo(db)
    batch = _seeded_batch(db)

    expected = sum(1 for a in batch.actions if action_published(a))
    life = queries.batch_lifecycle(db, batch)
    assert life.published == expected


def test_lifecycle_stages_are_monotonic(db):
    """An action can't be measured without being verified, nor verified without
    being published, nor published without being exported."""
    seed_live_demo(db)
    batch = _seeded_batch(db)

    life = queries.batch_lifecycle(db, batch)
    assert life.measured <= life.verified <= life.published <= life.total


def test_summary_is_deterministic_from_counts(db):
    """The one-line summary is assembled purely from the counts (no free text)."""
    seed_live_demo(db)
    batch = _seeded_batch(db)

    life = queries.batch_lifecycle(db, batch)
    assert life.summary == (
        f"{life.exported} exported · {life.published} published · "
        f"{life.verified} verified · {life.measured} measurement-eligible"
    )


# ---------------------------------------------------------------------------
# Guards — empty batch / no deliveries
# ---------------------------------------------------------------------------
def test_empty_batch_is_all_zero_no_div_by_zero(db):
    """A batch with zero actions returns all-zero counts and a clean summary —
    no division by zero, no crash."""
    batch = PriceBatch(
        id=new_id("batch"),
        external_id="empty-lifecycle-batch",
        idempotency_key="idem-empty-lifecycle",
        name="Empty",
        zone="Nowhere",
        status=BatchStatus.RECEIVED,
        run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION,
        total_store_count=0,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    life = queries.batch_lifecycle(db, batch)
    assert (life.exported, life.published, life.verified, life.measured, life.total) == (
        0,
        0,
        0,
        0,
        0,
    )
    assert life.summary == "0 exported · 0 published · 0 verified · 0 measurement-eligible"


def test_actions_without_deliveries_are_exported_not_published(db):
    """A batch whose actions were never dispatched (no deliveries) is fully
    exported but zero published — the worst-case post-export gap."""
    batch = PriceBatch(
        id=new_id("batch"),
        external_id="undispatched-batch",
        idempotency_key="idem-undispatched",
        name="Undispatched",
        zone="Dallas Zone 9",
        status=BatchStatus.RECEIVED,
        run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION,
        total_store_count=1,
    )
    db.add(batch)
    db.flush()
    for i in range(3):
        db.add(
            PriceAction(
                id=new_id("action"),
                batch_id=batch.id,
                sku=f"sku-{i}",
                product_name=f"Product {i}",
                store_id="900",
                approved_price=5.00,
                prior_price=6.00,
                reason="Price update",
            )
        )
    db.commit()
    db.refresh(batch)

    life = queries.batch_lifecycle(db, batch)
    assert life.exported == 3
    assert life.published == 0
    assert life.verified == 0
    assert life.measured == 0


# ---------------------------------------------------------------------------
# Read-only discipline
# ---------------------------------------------------------------------------
def test_rollup_is_read_only(db):
    """Computing the rollup mutates nothing — no decision/status change, no new
    audit events. Identical discipline to the eligibility + receipt derivations."""
    seed_live_demo(db)
    batch = _seeded_batch(db)
    before_decisions = {a.id: a.decision for a in batch.actions}
    before_status = batch.status
    before_audit = db.query(AuditEvent).filter(AuditEvent.batch_id == batch.id).count()

    _ = queries.batch_lifecycle(db, batch)
    db.flush()

    after_decisions = {a.id: a.decision for a in batch.actions}
    after_audit = db.query(AuditEvent).filter(AuditEvent.batch_id == batch.id).count()
    assert after_decisions == before_decisions, "rollup must not change any ActionDecision"
    assert batch.status == before_status, "rollup must not change BatchStatus"
    assert after_audit == before_audit, "rollup must not emit audit events"


# ---------------------------------------------------------------------------
# HTTP surface
# ---------------------------------------------------------------------------
def test_batch_detail_still_200_with_optional_lifecycle_field(db):
    """GET /batches/{id} still returns 200 and now carries the optional
    lifecycle rollup with the expected shape."""
    seed_live_demo(db)
    client = TestClient(app)

    res = client.get(f"/api/v1/batches/{DEMO_EXTERNAL_ID}")
    assert res.status_code == 200
    body = res.json()
    # The existing contract is intact.
    assert body["external_id"] == DEMO_EXTERNAL_ID
    assert "actions" in body
    # The new optional field is populated on the detail route.
    life = body["lifecycle"]
    assert life is not None
    assert life["exported"] == 12
    assert life["published"] == 6
    assert life["verified"] == 4
    assert life["measured"] == 4
    assert life["total"] == 12
    assert set(life) == {
        "exported",
        "published",
        "verified",
        "measured",
        "total",
        "summary",
    }


def test_lifecycle_endpoint_returns_rollup(db):
    """The dedicated GET /batches/{id}/lifecycle endpoint returns the rollup."""
    seed_live_demo(db)
    client = TestClient(app)

    res = client.get(f"/api/v1/batches/{DEMO_EXTERNAL_ID}/lifecycle")
    assert res.status_code == 200
    body = res.json()
    assert body["exported"] == 12
    assert body["published"] == 6
    assert body["verified"] == 4
    assert body["measured"] == 4
    assert body["measured"] <= body["verified"] <= body["published"] <= body["total"]
    assert "measurement-eligible" in body["summary"]


def test_lifecycle_endpoint_404_for_unknown_batch(db):
    """Mirrors the detail route's 404 contract for an unknown external id."""
    seed_live_demo(db)
    client = TestClient(app)
    assert client.get("/api/v1/batches/does-not-exist/lifecycle").status_code == 404


def test_lifecycle_endpoint_resolves_scope_seeded_batch(db):
    """The seeded Memorial Day batch is demo-scoped; the lifecycle endpoint
    resolves it by external id exactly like the detail route does, and the
    underlying batch carries the demo source tag (Live/Demo boundary intact)."""
    seed_live_demo(db)
    batch = _seeded_batch(db)
    assert batch.source_run_id == DEMO_MEMORIAL_DAY

    client = TestClient(app)
    res = client.get(f"/api/v1/batches/{DEMO_EXTERNAL_ID}/lifecycle")
    assert res.status_code == 200
