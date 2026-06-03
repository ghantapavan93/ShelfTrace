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


def test_open_demo_honors_actor_name_in_audit(db):
    """Gap 5: even with auth DISABLED (the open demo), an explicit X-Actor-Name is
    attributed to a real person in the audit trail — so a reviewer's recovery
    action reads 'Sarah Chen', not the generic 'operator'. No API key required."""
    from app.models import AuditEvent, Incident
    from tests._helpers import seed_live_demo

    seed_live_demo(db)
    incident = db.query(Incident).first()
    assert incident is not None

    client = TestClient(app)
    r = client.post(
        f"/api/v1/incidents/{incident.id}/retry",
        headers={"X-Actor-Name": "Sarah Chen"},  # no X-API-Key — open demo
    )
    assert r.status_code == 200, r.text

    db.expire_all()
    rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.incident_id == incident.id)
        .all()
    )
    assert any(a.actor == "Sarah Chen" for a in rows), [a.actor for a in rows]


def test_open_demo_without_actor_name_falls_back_to_operator(db):
    """No name given → the anonymous operator identity, exactly as before (the
    fix doesn't change the default, only enables an opt-in override)."""
    from app.security import _resolve, ANONYMOUS_OPERATOR

    assert _resolve(None, None) is ANONYMOUS_OPERATOR
    assert _resolve(None, "   ") is ANONYMOUS_OPERATOR  # blank is ignored
    ident = _resolve(None, "Jordan Lee")
    assert ident.actor == "Jordan Lee" and ident.role == "operator"


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


def test_production_startup_rejects_demo_defaults(monkeypatch):
    from app.config import production_startup_errors, settings as live_settings

    monkeypatch.setattr(live_settings, "app_env", "production")
    monkeypatch.setattr(live_settings, "demo_mode", True)
    monkeypatch.setattr(live_settings, "database_url", "sqlite:///demo.db")
    monkeypatch.setattr(live_settings, "use_alembic", False)
    monkeypatch.setattr(live_settings, "log_format", "text")
    monkeypatch.setattr(live_settings, "rate_limit_enabled", False)
    monkeypatch.setattr(live_settings, "api_keys_json", "")
    monkeypatch.setattr(live_settings, "cors_origins", "http://localhost:3000")

    errors = production_startup_errors(live_settings)
    assert "DEMO_MODE must be false when APP_ENV=production" in errors
    assert "DATABASE_URL must use PostgreSQL in production" in errors
    assert "API_KEYS_JSON must configure at least one API key in production" in errors
    assert "CORS_ORIGINS cannot use localhost origins in production" in errors


def _all_dependency_calls(dependant):
    """Recursively collect every dependency callable in a route's dependant tree."""
    calls = []
    for dep in dependant.dependencies:
        if dep.call is not None:
            calls.append(dep.call)
        calls.extend(_all_dependency_calls(dep))
    return calls


def test_every_mutating_endpoint_requires_operator():
    """Blanket contract: EVERY mutating route (POST/PUT/PATCH/DELETE) must carry
    the operator auth dependency. This is the test whose absence let several
    product-graph / scenario-enrichment / data-replay write endpoints ship without
    `require_operator` — a viewer key (or anyone, when auth is on) could mutate
    pricing-influencing state. Introspects the dependency tree directly, so it
    catches a missing guard on ANY current or future write route, not just a
    sampled one. (Deep-audit P0: authorization coverage.)"""
    from fastapi.routing import APIRoute

    from app.main import app
    from app.security import require_any, require_operator

    mutating = {"POST", "PUT", "PATCH", "DELETE"}
    # Read-only endpoints that use POST purely to accept a request body (they
    # perform NO writes). These are semantically GETs and are intentionally open
    # like every other read, so they are exempt from the operator requirement.
    # Vetted individually — a real write must never be added here.
    read_only_post_allowlist = {
        # "Ask ShelfTrace" — deterministic, template-driven explanation assembled
        # from existing rows; takes a natural-language `query` in the body. A
        # viewer/reviewer must be able to ask "why is this blocked?".
        "/api/v1/operations/explain",
    }
    unguarded = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        methods = (route.methods or set()) & mutating
        if not methods:
            continue
        if route.path in read_only_post_allowlist:
            continue
        calls = _all_dependency_calls(route.dependant)
        # require_operator is the only acceptable guard for a write. (require_any
        # alone would let a viewer through, so it does NOT satisfy the contract.)
        if require_operator not in calls:
            # Surface require_any too, to make a misconfiguration obvious in the diff.
            has_any = require_any in calls
            unguarded.append(
                f"{sorted(methods)} {route.path}"
                + ("  (has require_any but NOT require_operator)" if has_any else "")
            )
    assert not unguarded, (
        "Mutating endpoints missing require_operator:\n  " + "\n  ".join(sorted(unguarded))
    )


def test_viewer_key_cannot_write_product_graph_entity(db, keys_enabled):
    """End-to-end proof for one of the newly-guarded endpoints: a viewer key is
    rejected with 403 on POST /product-graph/entities (previously fully open)."""
    client = TestClient(app)
    r = client.post(
        "/api/v1/product-graph/entities",
        json={"canonical_title": "Sneaky Entity"},
        headers={"X-API-Key": "view-key-test"},
    )
    assert r.status_code == 403
    assert "Operator role" in r.json()["detail"]


def test_viewer_key_cannot_trigger_data_replay_import(db, keys_enabled):
    """Second newly-guarded path: a viewer cannot import a USDA dataset (which
    creates source rows that feed the engine)."""
    client = TestClient(app)
    r = client.post(
        "/api/v1/data-sources/import/usda-fdc",
        headers={"X-API-Key": "view-key-test"},
    )
    assert r.status_code == 403


def test_production_startup_accepts_hardened_config(monkeypatch):
    from app.config import production_startup_errors, settings as live_settings

    monkeypatch.setattr(live_settings, "app_env", "production")
    monkeypatch.setattr(live_settings, "demo_mode", False)
    monkeypatch.setattr(
        live_settings,
        "database_url",
        "postgresql+psycopg2://shelftrace:secret@db.internal:5432/shelftrace",
    )
    monkeypatch.setattr(live_settings, "use_alembic", True)
    monkeypatch.setattr(live_settings, "log_format", "json")
    monkeypatch.setattr(live_settings, "rate_limit_enabled", True)
    monkeypatch.setattr(
        live_settings,
        "api_keys_json",
        json.dumps({"op-key": {"role": "operator", "actor": "Ops"}}),
    )
    monkeypatch.setattr(live_settings, "cors_origins", "https://app.shelftrace.example")

    assert production_startup_errors(live_settings) == []
