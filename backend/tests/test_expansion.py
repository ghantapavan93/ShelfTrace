import pytest

from app.models import ActionDecision, BatchStatus, ChannelDelivery, Incident, IncidentType, PriceAction
from app.seed import DEMO_STORES, demo_payload
from app.services import orchestrator, recovery
from app.services.ingestion import ingest_batch


def _seed(db):
    from tests._helpers import seed_live_demo

    return seed_live_demo(db)


def _resolve_all(db):
    for inc in db.query(Incident).all():
        recovery.retry_incident(db, inc.id)


def test_expansion_blocked_until_ready(db):
    batch = _seed(db)
    # Batch is BLOCKED at reset — expansion must be refused.
    with pytest.raises(orchestrator.ExpansionError):
        orchestrator.expand_batch(db, batch)


def test_expansion_creates_deliveries_only_when_ready_and_completes(db):
    batch = _seed(db)
    expansion_stores = set(DEMO_STORES[2:])  # 317, 401

    # No expansion-store deliveries exist before expansion.
    pre = (
        db.query(ChannelDelivery)
        .join(PriceAction, PriceAction.id == ChannelDelivery.action_id)
        .filter(PriceAction.store_id.in_(expansion_stores))
        .count()
    )
    assert pre == 0

    _resolve_all(db)
    db.refresh(batch)
    assert batch.status == BatchStatus.READY_FOR_EXPANSION

    orchestrator.expand_batch(db, batch)
    db.refresh(batch)

    # Expansion deliveries now exist (3 channels x 3 products x 2 stores = 18).
    post = (
        db.query(ChannelDelivery)
        .join(PriceAction, PriceAction.id == ChannelDelivery.action_id)
        .filter(PriceAction.store_id.in_(expansion_stores))
        .count()
    )
    assert post == 18

    # All expansion actions verified -> batch COMPLETED.
    assert batch.status == BatchStatus.COMPLETED
    assert batch.expansion_blocked is False
    exp_actions = [a for a in batch.actions if a.store_id in expansion_stores]
    assert all(a.decision == ActionDecision.ELIGIBLE for a in exp_actions)
