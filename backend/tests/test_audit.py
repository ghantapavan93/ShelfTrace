from app.models import AuditEvent, Incident, IncidentStatus, IncidentType
from app.services import queries, recovery


def _seed(db):
    from tests._helpers import seed_live_demo

    return seed_live_demo(db)


def test_all_transitions_are_audited(db):
    batch = _seed(db)
    incident = db.query(Incident).filter(Incident.type == IncidentType.PRICE_MISMATCH).one()

    before = db.query(AuditEvent).count()
    recovery.retry_incident(db, incident.id)
    after = db.query(AuditEvent).count()

    # Acceptance, blocking, the incident open, the retry and the resolution are all logged.
    assert after > before
    events = {e.event for e in db.query(AuditEvent).all()}
    assert "Approved batch accepted" in events
    assert any("retry requested" in e.lower() for e in events)
    assert any("resolved" in e.lower() for e in events)


def _audit_order(db, incident_id: str):
    return [
        e.event
        for e in db.query(AuditEvent)
        .filter(AuditEvent.incident_id == incident_id)
        .order_by(AuditEvent.created_at)
        .all()
    ]


def test_pos_acknowledgement_precedes_incident_resolution(db):
    """Retry-driven recovery must record the POS acknowledgement BEFORE the
    incident is marked resolved. This is the causality the audit timeline shows."""
    batch = _seed(db)
    egg = db.query(Incident).filter(Incident.type == IncidentType.PRICE_MISMATCH).one()

    recovery.retry_incident(db, egg.id)
    order = _audit_order(db, egg.id)

    ack_idx = next(i for i, e in enumerate(order) if "acknowledgement received" in e.lower())
    res_idx = next(i for i, e in enumerate(order) if e.lower() == "incident resolved")
    assert ack_idx < res_idx, f"Audit order wrong: {order}"
    # The channel-specific acknowledgement names the offending channel.
    assert "POS acknowledgement received" in order


def test_esl_acknowledgement_precedes_markdown_resolution(db):
    """Same causality applies to ESL timeout-then-success markdown recovery."""
    batch = _seed(db)
    straw = (
        db.query(Incident)
        .filter(Incident.type == IncidentType.DEADLINE_RISK)
        .one()
    )
    recovery.retry_incident(db, straw.id)
    order = _audit_order(db, straw.id)

    ack_idx = next(i for i, e in enumerate(order) if e == "ESL acknowledgement received")
    res_idx = next(i for i, e in enumerate(order) if e.lower() == "incident resolved")
    assert ack_idx < res_idx, f"Audit order wrong: {order}"


def test_cannot_resolve_without_verified_acknowledgement(db):
    """An incident cannot be marked resolved while channels still disagree.
    resolve_incident re-verifies and rejects with RecoveryError; the egg
    incident stays unresolved until a real acknowledgement comes through."""
    batch = _seed(db)
    egg = db.query(Incident).filter(Incident.type == IncidentType.PRICE_MISMATCH).one()
    import pytest as _pytest
    with _pytest.raises(recovery.RecoveryError):
        recovery.resolve_incident(db, egg.id)
    db.refresh(egg)
    assert egg.status in (IncidentStatus.OPEN, IncidentStatus.RETRYING)
    # Audit trail must not contain a resolution event.
    assert not any("resolved" in e.lower() for e in _audit_order(db, egg.id))


def test_explanation_is_grounded_in_records(db):
    _seed(db)
    incident = db.query(Incident).filter(Incident.type == IncidentType.PRICE_MISMATCH).one()
    explanation = queries.incident_explanation(db, incident)

    # The narrative only references facts present in the structured records.
    assert "4.19" in explanation.what_happened
    assert "POS" in explanation.what_happened
    assert any("Retry" in a for a in explanation.recommended_next_actions)
    assert explanation.channels  # channel facts attached
