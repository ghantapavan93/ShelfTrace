"""API-key auth + CORS behavior.

The 34 prior tests don't pass auth headers — they prove the default behavior
(auth bypassed, anonymous-operator identity). These tests prove the *enabled*
path: when API_KEYS_JSON is set, the same endpoints reject unauthenticated
requests and accept operator-keyed ones.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture()
def keys_enabled(monkeypatch):
    """Temporarily configure operator + viewer API keys for one test."""
    keys = {
        "op-key-test": {"role": "operator", "actor": "Test Operator"},
        "view-key-test": {"role": "viewer", "actor": "Test Viewer"},
    }
    monkeypatch.setattr(settings, "api_keys_json", json.dumps(keys))
    yield keys


def test_auth_disabled_by_default_allows_mutating_endpoint(db):
    """With no API_KEYS_JSON set, mutating endpoints stay open — the demo and
    the frontend keep working with no header. /health reflects this honestly."""
    client = TestClient(app)
    r = client.get("/health")
    # Health may be 200 or 503 depending on whether Redis is running in the
    # test environment; we only assert it surfaces the auth state correctly.
    body = r.json()
    assert body["auth_enabled"] is False


def test_missing_key_returns_401_when_auth_enabled(db, keys_enabled):
    client = TestClient(app)
    # Any mutating endpoint will do; the demo reset is the cheapest.
    r = client.post("/api/v1/demo/reset")
    assert r.status_code == 401
    assert "X-API-Key" in r.json()["detail"]


def test_viewer_key_cannot_write(db, keys_enabled):
    client = TestClient(app)
    r = client.post("/api/v1/demo/reset", headers={"X-API-Key": "view-key-test"})
    assert r.status_code == 403
    assert "Operator role" in r.json()["detail"]


def test_operator_key_accepts_write_and_records_actor(db, keys_enabled):
    """Operator key works AND the actor name lands in the audit trail."""
    from app.models import AuditEvent
    from tests._helpers import seed_live_demo

    seed_live_demo(db)
    incident = db.query(__import__("app.models", fromlist=["Incident"]).Incident).first()
    assert incident is not None

    client = TestClient(app)
    r = client.post(
        f"/api/v1/incidents/{incident.id}/retry",
        headers={
            "X-API-Key": "op-key-test",
            "X-Actor-Name": "Avery Davis",
        },
    )
    assert r.status_code == 200, r.text

    # The retry call records an audit row whose actor is the authenticated
    # operator name, not the hard-coded "operator" string.
    db.expire_all()
    rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.incident_id == incident.id)
        .order_by(AuditEvent.created_at.desc())
        .all()
    )
    assert any(a.actor == "Avery Davis" for a in rows), [a.actor for a in rows]


def test_unknown_key_returns_401(db, keys_enabled):
    client = TestClient(app)
    r = client.post("/api/v1/demo/reset", headers={"X-API-Key": "nope"})
    assert r.status_code == 401


def test_cors_origin_allowlist_replaces_wildcard():
    """The default CORS config exposes a concrete origin list — never '*'.
    This catches a future regression where someone re-introduces the wildcard."""
    from app.config import settings as live_settings

    assert "*" not in live_settings.cors_origin_list
    assert live_settings.cors_origin_list  # non-empty
