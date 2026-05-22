from app.models import (
    Incident,
    IncidentSeverity,
    IncidentType,
)
from app.seed import demo_payload
from app.services import orchestrator
from app.services.ingestion import ingest_batch


def _seed(db):
    batch = ingest_batch(db, demo_payload()).batch
    orchestrator.drain(db)
    db.refresh(batch)
    return batch


def test_checkout_mismatch_creates_critical_incident(db):
    batch = _seed(db)
    incidents = db.query(Incident).filter(Incident.type == IncidentType.PRICE_MISMATCH).all()
    assert len(incidents) == 1
    inc = incidents[0]
    assert inc.severity == IncidentSeverity.CRITICAL
    assert inc.offending_channel.value == "pos"
    # Grounded in the real observed price.
    assert "4.49" in inc.summary


def test_esl_timeout_creates_deadline_risk(db):
    batch = _seed(db)
    deadline = db.query(Incident).filter(Incident.type == IncidentType.DEADLINE_RISK).all()
    # One per strawberry canary action.
    assert len(deadline) == 2
    assert all(i.severity == IncidentSeverity.URGENT for i in deadline)
    assert all(i.offending_channel.value == "esl" for i in deadline)
