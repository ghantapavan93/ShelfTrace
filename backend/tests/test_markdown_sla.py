"""Markdown SLA: the perishable-markdown reliability summary.

The contract under test: a perishable markdown's shelf label (ESL) must
acknowledge the approved markdown before its sell-through deadline. The
``/markdowns`` endpoint reports each markdown's SLA status plus an aggregate
compliance summary, and respects the Live/Demo scope boundary.

The seeded Memorial Day demo is a perfect mixed-compliance fixture: the
strawberry markdown lands in two canary stores (214, 302); only store 214's
ESL is configured to time out, so store 302 is ``met`` and 214 is unmet —
50% compliance straight out of the seed.
"""
from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.seed import DEMO_EXTERNAL_ID, seed_live
from app.services import queries

STRAWBERRY = "strawberry-1lb"


def _deadline(batch):
    straw = next(a for a in batch.actions if a.sku == STRAWBERRY)
    return queries._ensure_utc(straw.markdown_deadline)


# ──────────────────────────────────────────────────────────────────────
# Aggregate summary shape + internal consistency
# ──────────────────────────────────────────────────────────────────────
def test_markdowns_summary_present_and_consistent(db):
    seed_live(db)
    client = TestClient(app)
    body = client.get("/api/v1/markdowns").json()

    assert body["zone"] == "Dallas Zone 2"
    s = body["summary"]
    # Two canary stores carry the strawberry markdown (214, 302).
    assert s["total"] == 2
    # Buckets partition the total exactly.
    assert s["met"] + s["at_risk"] + s["breached"] + s["pending"] == s["total"]
    # Every markdown is the perishable strawberry.
    assert {m["action"]["sku"] for m in body["markdowns"]} == {STRAWBERRY}
    # Compliance is met / total, rounded to 0.1.
    assert s["compliance_pct"] == round(100 * s["met"] / s["total"], 1)


def test_markdowns_mixed_compliance_one_store_unmet(db):
    """Store 302's ESL verifies (default success) → met; store 214's ESL is
    TIMEOUT_THEN_SUCCESS → unmet. Exactly one of two is met = 50% compliance."""
    batch = seed_live(db)
    # Pin "now" 30 minutes BEFORE the deadline so the unmet one is at_risk.
    now = _deadline(batch) - timedelta(minutes=30)
    sla = queries.markdown_sla(db, batch, now=now)

    assert sla["summary"]["total"] == 2
    assert sla["summary"]["met"] == 1
    assert sla["summary"]["compliance_pct"] == 50.0

    by_store = {m["action"]["store_id"]: m for m in sla["markdowns"]}
    assert by_store["302"]["sla_status"] == "met"
    assert by_store["302"]["esl_verified"] is True
    assert by_store["214"]["sla_status"] == "at_risk"
    assert by_store["214"]["esl_verified"] is False
    # The soonest unmet deadline points at the strawberry that's behind.
    assert sla["summary"]["soonest_unmet_sku"] == STRAWBERRY


def test_markdowns_breached_after_deadline(db):
    """Past the deadline with an unacknowledged shelf label → breached. The
    verified store stays met (current shelf state reflects the markdown)."""
    batch = seed_live(db)
    now = _deadline(batch) + timedelta(minutes=30)
    sla = queries.markdown_sla(db, batch, now=now)

    by_store = {m["action"]["store_id"]: m for m in sla["markdowns"]}
    assert by_store["214"]["sla_status"] == "breached"
    assert by_store["302"]["sla_status"] == "met"
    assert sla["summary"]["breached"] == 1
    assert sla["summary"]["met"] == 1


def test_markdowns_pending_when_deadline_far_out(db):
    """Far from the deadline, an unverified markdown is merely pending, not yet
    at risk — it still has comfortable runway."""
    batch = seed_live(db)
    now = _deadline(batch) - timedelta(hours=12)
    sla = queries.markdown_sla(db, batch, now=now)

    by_store = {m["action"]["store_id"]: m for m in sla["markdowns"]}
    assert by_store["214"]["sla_status"] == "pending"
    assert by_store["302"]["sla_status"] == "met"
    assert sla["summary"]["at_risk"] == 0
    assert sla["summary"]["pending"] == 1


# ──────────────────────────────────────────────────────────────────────
# Scope boundary
# ──────────────────────────────────────────────────────────────────────
def test_markdowns_scope_live_empty_when_only_demo_batch(db):
    """The seeded demo is scope 'demo:memorial-day'. A Live-mode request with
    no live batch must return a zeroed SLA payload (not 404, not the demo)."""
    seed_live(db)
    client = TestClient(app)
    body = client.get("/api/v1/markdowns?scope=live").json()
    assert body["markdowns"] == []
    assert body["summary"]["total"] == 0
    assert body["summary"]["compliance_pct"] == 100.0


def test_markdowns_scope_demo_returns_seeded_markdowns(db):
    seed_live(db)
    client = TestClient(app)
    body = client.get("/api/v1/markdowns?scope=demo").json()
    assert body["summary"]["total"] == 2


def test_markdowns_external_id_is_escape_hatch(db):
    """An explicit external_id bypasses scope — a Live-mode user can still
    inspect the seeded demo batch's markdowns by direct id."""
    seed_live(db)
    client = TestClient(app)
    body = client.get(
        f"/api/v1/markdowns?external_id={DEMO_EXTERNAL_ID}&scope=live"
    ).json()
    assert body["summary"]["total"] == 2
