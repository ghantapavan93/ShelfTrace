import pytest

from app.models import (
    ActionDecision,
    AuditEvent,
    BatchStatus,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
    StoreTask,
    StoreTaskStatus,
)
from app.seed import demo_payload
from app.services import orchestrator, recovery
from app.services.ingestion import ingest_batch


def _seed(db):
    from tests._helpers import seed_live_demo

    return seed_live_demo(db)


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


def test_complete_store_task_marks_done_and_audits(db):
    """Completing the open verification task flips it to DONE and writes audit."""
    _seed(db)
    incident = _egg_incident(db)
    task = recovery.create_store_task(db, incident.id)
    assert task.status == StoreTaskStatus.OPEN

    completed = recovery.complete_store_task(db, incident.id)

    assert completed.id == task.id
    assert completed.status == StoreTaskStatus.DONE
    # The completion is recorded for the audit trail.
    events = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.incident_id == incident.id,
            AuditEvent.event == "Store verification task completed",
        )
        .count()
    )
    assert events == 1


def test_complete_store_task_without_open_task_raises(db):
    """No open task -> RecoveryError (surfaced as 409), not a silent no-op."""
    _seed(db)
    incident = _egg_incident(db)
    with pytest.raises(recovery.RecoveryError):
        recovery.complete_store_task(db, incident.id)


def test_complete_store_task_is_idempotent_guarded(db):
    """A second completion finds no OPEN task and is rejected."""
    _seed(db)
    incident = _egg_incident(db)
    recovery.create_store_task(db, incident.id)
    recovery.complete_store_task(db, incident.id)

    with pytest.raises(recovery.RecoveryError):
        recovery.complete_store_task(db, incident.id)

    # Exactly one task exists and it stayed DONE.
    tasks = db.query(StoreTask).filter(StoreTask.incident_id == incident.id).all()
    assert len(tasks) == 1
    assert tasks[0].status == StoreTaskStatus.DONE


def test_complete_store_task_resolves_when_channels_agree(db):
    """If the underlying action already heals, completing the task closes the incident."""
    _seed(db)
    incident = _egg_incident(db)
    # Heal the offending channel first so reconciliation will return ELIGIBLE,
    # then create + complete the verification task.
    recovery.retry_incident(db, incident.id)
    db.refresh(incident)
    # retry already resolved the egg; create a fresh incident scenario via the
    # strawberry deadline-risk path instead to exercise the resolve-on-complete.
    straw = _strawberry_incidents(db)[0]
    recovery.retry_incident(db, straw.id)  # heals ESL timeout_then_success
    recovery.create_store_task(db, straw.id)

    completed = recovery.complete_store_task(db, straw.id)
    db.refresh(straw)

    assert completed.status == StoreTaskStatus.DONE
    assert straw.status == IncidentStatus.RESOLVED
