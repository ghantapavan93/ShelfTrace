from app.models import ActionDecision, BatchStatus
from app.seed import demo_payload
from app.services import orchestrator
from app.services.ingestion import ingest_batch


def _seed(db):
    batch = ingest_batch(db, demo_payload()).batch
    orchestrator.drain(db)
    db.refresh(batch)
    return batch


def test_canary_blocks_zone_expansion(db):
    batch = _seed(db)
    # The egg checkout mismatch in the canary must block expansion.
    assert batch.expansion_blocked is True
    assert batch.status == BatchStatus.BLOCKED
    assert "mismatch" in (batch.block_reason or "").lower()


def test_expansion_excludes_unresolved_actions(db):
    batch = _seed(db)
    canary = next(g for g in batch.rollout_groups if g.kind == "canary")
    canary_actions = [a for a in batch.actions if a.store_id in canary.store_ids]

    blocked = [a for a in canary_actions if a.decision == ActionDecision.BLOCKED]
    eligible = [a for a in canary_actions if a.decision == ActionDecision.ELIGIBLE]
    retrying = [a for a in canary_actions if a.decision == ActionDecision.RETRY]

    # Egg @214 blocked; strawberry @214 timing out; OJ + egg@302 + strawberry@302 eligible.
    assert any(a.sku == "egg-cage-free-brown-12" and a.store_id == "214" for a in blocked)
    assert all(a.decision != ActionDecision.ELIGIBLE for a in blocked)
    assert len(eligible) >= 2
    assert len(retrying) == 1  # strawberry @214 only
