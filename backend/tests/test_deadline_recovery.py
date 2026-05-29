"""Command 4 recovery additions: store-task completion + relative strawberry deadline.

Covers the deadline/ESL recovery path of the seeded Memorial Day scenario:
the strawberry markdown carries an always-future deadline (no stale fixed date),
its ESL connector times-out-then-succeeds producing a DEADLINE_RISK incident, and
the human-in-the-loop store-task completion closes the loop with an audit trail.

Follows tests/test_recovery.py patterns (db fixture, seed_live_demo helper).
"""
from datetime import timezone

import pytest

from app.models import (
    AuditEvent,
    Channel,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
    StoreTask,
    StoreTaskStatus,
    utcnow,
)
from app.services import recovery, scenarios


def _seed(db):
    from tests._helpers import seed_live_demo

    return seed_live_demo(db)


def _deadline_incident(db) -> Incident:
    """The strawberry markdown ESL deadline-risk incident from the seeded scenario."""
    return (
        db.query(Incident)
        .filter(Incident.type == IncidentType.DEADLINE_RISK)
        .order_by(Incident.created_at)
        .first()
    )


def test_complete_store_task_marks_done(db):
    """Seed a scenario producing a deadline/ESL incident, create a store task,
    complete it, and assert the task is DONE with a completion AuditEvent written."""
    _seed(db)
    incident = _deadline_incident(db)
    assert incident is not None
    assert incident.type == IncidentType.DEADLINE_RISK

    task = recovery.create_store_task(db, incident.id)
    assert task.status == StoreTaskStatus.OPEN

    completed = recovery.complete_store_task(db, incident.id)

    assert completed.id == task.id
    assert completed.status == StoreTaskStatus.DONE

    events = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.incident_id == incident.id,
            AuditEvent.event == "Store verification task completed",
        )
        .count()
    )
    assert events == 1


def test_complete_store_task_invalid_transition_rejected(db):
    """Completing a non-existent open task (none created) or an already-done task
    raises RecoveryError — never a silent no-op."""
    _seed(db)
    incident = _deadline_incident(db)
    assert incident is not None

    # No OPEN task exists yet -> invalid transition.
    with pytest.raises(recovery.RecoveryError):
        recovery.complete_store_task(db, incident.id)

    # Create + complete once; the task is now DONE.
    recovery.create_store_task(db, incident.id)
    recovery.complete_store_task(db, incident.id)

    # Completing an already-done task (no remaining OPEN task) is rejected.
    with pytest.raises(recovery.RecoveryError):
        recovery.complete_store_task(db, incident.id)

    tasks = db.query(StoreTask).filter(StoreTask.incident_id == incident.id).all()
    assert len(tasks) == 1
    assert tasks[0].status == StoreTaskStatus.DONE


def test_strawberry_deadline_is_relative_not_stale(db):
    """ensure_memorial_day's strawberry deadline must be in the FUTURE relative to
    utcnow() — proving it is anchored to now (no stale hardcoded calendar date)."""
    config = scenarios.ensure_memorial_day(db)
    straw = next(a for a in config.actions if a.sku == "strawberry-1lb")
    assert straw.deadline_at is not None

    deadline = straw.deadline_at
    # Persisted timestamps may come back naive; treat as UTC for the comparison.
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    assert deadline > utcnow()


def test_esl_retry_recovers_deadline_incident(db):
    """The ESL timeout_then_success connector opens a DEADLINE_RISK incident on the
    strawberry markdown; retrying re-attempts the ESL delivery and progresses the
    incident toward resolution (status changes off OPEN, delivery re-attempted)."""
    _seed(db)
    incident = _deadline_incident(db)
    assert incident is not None
    assert incident.offending_channel == Channel.ESL
    assert incident.status == IncidentStatus.OPEN

    action = db.get(PriceAction, incident.action_id)
    esl_delivery = recovery._delivery_for(db, action.id, Channel.ESL)
    assert esl_delivery is not None
    attempts_before = esl_delivery.attempts

    recovery.retry_incident(db, incident.id)

    db.refresh(incident)
    db.refresh(esl_delivery)

    # ESL update was re-attempted on retry.
    assert esl_delivery.attempts == attempts_before + 1
    # The incident progressed off OPEN toward resolution.
    assert incident.status != IncidentStatus.OPEN
    # timeout_then_success heals on the second attempt -> incident resolves.
    assert incident.status == IncidentStatus.RESOLVED
