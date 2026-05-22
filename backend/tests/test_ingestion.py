from app.models import OutboxEvent, PriceBatch
from app.schemas import PriceBatchIn
from app.seed import demo_payload
from app.services.ingestion import ingest_batch


def test_idempotent_batch(db):
    payload = demo_payload()
    first = ingest_batch(db, payload)
    second = ingest_batch(db, payload)

    assert first.created is True
    assert second.created is False
    assert first.batch.id == second.batch.id
    assert db.query(PriceBatch).count() == 1


def test_batch_and_outbox_committed_together(db):
    result = ingest_batch(db, demo_payload())

    # Batch, actions, rollout groups and outbox events all exist after one commit.
    assert result.created is True
    assert len(result.batch.actions) == 12  # 3 products x 4 stores
    assert len(result.batch.rollout_groups) == 2

    canary = next(g for g in result.batch.rollout_groups if g.kind == "canary")
    canary_actions = [a for a in result.batch.actions if a.store_id in canary.store_ids]
    outbox = db.query(OutboxEvent).all()
    # One canary-publish event per canary action.
    assert len(outbox) == len(canary_actions) == 6
