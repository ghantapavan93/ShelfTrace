import pytest

from app.models import (
    ActionDecision,
    BatchStatus,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
)
from app.seed import demo_payload
from app.services import orchestrator, recovery
from app.services.ingestion import ingest_batch


def _seed(db):
    batch = ingest_batch(db, demo_payload()).batch
    orchestrator.drain(db)
    db.refresh(batch)
    return batch


def _egg_incident(db):
    return db.query(Incident).filter(Incident.type == IncidentType.PRICE_MISMATCH).one()


def _strawberry_incidents(db):
    return db.query(Incident).filter(Incident.type == IncidentType.DEADLINE_RISK).all()


def test_retry_resolves_action_but_batch_stays_held(db):
    """Retrying the egg resolves that action — but the batch must NOT fully unblock
    while the strawberry deadline-risk actions are still unresolved."""
    batch = _seed(db)
    incident = _egg_incident(db)
    action_id = incident.action_id
    assert batch.expansion_blocked is True

    recovery.retry_incident(db, incident.id)

    db.refresh(incident)
    action = db.get(PriceAction, action_id)
    db.refresh(batch)

    # Action-level: egg is resolved and eligible.
    assert incident.status == IncidentStatus.RESOLVED
    assert action.decision == ActionDecision.ELIGIBLE
    # Batch-level: still held because strawberries remain unresolved.
    assert batch.status == BatchStatus.PARTIALLY_BLOCKED
    assert batch.expansion_blocked is True


def test_full_resolution_enables_expansion(db):
    """Only after every blocking action resolves does the batch become ready."""
    batch = _seed(db)
    recovery.retry_incident(db, _egg_incident(db).id)
    for inc in _strawberry_incidents(db):
        recovery.retry_incident(db, inc.id)

    db.refresh(batch)
    assert batch.status == BatchStatus.READY_FOR_EXPANSION
    assert batch.expansion_blocked is False

    open_incidents = (
        db.query(Incident)
        .filter(Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]))
        .count()
    )
    assert open_incidents == 0


def test_double_resolution_is_safe(db):
    _seed(db)
    incident = _egg_incident(db)
    recovery.retry_incident(db, incident.id)
    db.refresh(incident)
    assert incident.status == IncidentStatus.RESOLVED

    # A second resolution attempt must be rejected, not create a conflicting state.
    with pytest.raises(recovery.RecoveryError):
        recovery.resolve_incident(db, incident.id)

    db.refresh(incident)
    assert incident.status == IncidentStatus.RESOLVED
