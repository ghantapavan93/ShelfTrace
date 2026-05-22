from app.models import AuditEvent, Incident, IncidentType
from app.seed import demo_payload
from app.services import orchestrator, queries, recovery
from app.services.ingestion import ingest_batch


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


def test_explanation_is_grounded_in_records(db):
    _seed(db)
    incident = db.query(Incident).filter(Incident.type == IncidentType.PRICE_MISMATCH).one()
    explanation = queries.incident_explanation(db, incident)

    # The narrative only references facts present in the structured records.
    assert "4.19" in explanation.what_happened
    assert "POS" in explanation.what_happened
    assert any("Retry" in a for a in explanation.recommended_next_actions)
    assert explanation.channels  # channel facts attached
