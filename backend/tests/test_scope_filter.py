"""Backend source_run_id scope filter — replaces the frontend-only Live/Demo
boundary with a real DB filter.

Verifies that:
  • The /entities endpoint honors ?scope=live to hide demo-seeded rows.
  • The /entities endpoint honors ?scope=demo to hide user-uploaded rows.
  • Default (no ?scope=) returns everything (backward compatible).
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import ProductEntity
from app.scope import (
    DEMO_MEMORIAL_DAY,
    DEMO_REALISTIC_SCALE,
    Scope,
    apply_filter,
    build_demo_id,
    build_user_id,
    current_scope,
)


def _seed_three_scopes(db):
    """Three entities — one demo, one user, one legacy NULL."""
    db.add(ProductEntity(
        id="ent_demo_eggs", canonical_title="Demo Eggs",
        is_manual=True, source_run_id=DEMO_MEMORIAL_DAY,
    ))
    db.add(ProductEntity(
        id="ent_user_milk", canonical_title="User Milk",
        is_manual=False, source_run_id="user:abc123def456",
    ))
    db.add(ProductEntity(
        id="ent_legacy", canonical_title="Legacy",
        is_manual=False, source_run_id=None,  # pre-migration row
    ))
    db.commit()


def test_scope_enum_parses_query_strings():
    assert Scope.from_query("live") == Scope.LIVE
    assert Scope.from_query("LIVE") == Scope.LIVE
    assert Scope.from_query("demo") == Scope.DEMO
    assert Scope.from_query("all") == Scope.ALL
    # Unknown values fall back to ALL (defensive default)
    assert Scope.from_query("garbage") == Scope.ALL
    assert Scope.from_query(None) == Scope.ALL
    assert Scope.from_query("") == Scope.ALL


def test_build_user_id_is_deterministic_per_payload():
    """Same CSV bytes → same user:<hash> id. Different bytes → different id."""
    a1 = build_user_id(b"sku,name\nX,X")
    a2 = build_user_id(b"sku,name\nX,X")
    b = build_user_id(b"sku,name\nY,Y")
    assert a1 == a2
    assert a1 != b
    assert a1.startswith("user:")
    assert len(a1) == len("user:") + 16


def test_build_demo_id_normalizes_whitespace():
    assert build_demo_id("Memorial Day") == "demo:memorial-day"
    assert build_demo_id("  Realistic Scale  ") == "demo:realistic-scale"


def test_apply_filter_live_returns_user_and_null_rows(db):
    """Live mode includes user:* AND legacy NULL rows so existing uploads
    aren't lost. It strictly excludes demo:* rows."""
    from sqlalchemy import select

    _seed_three_scopes(db)
    q = apply_filter(select(ProductEntity), ProductEntity.source_run_id, Scope.LIVE)
    rows = list(db.scalars(q))
    ids = {r.id for r in rows}
    assert "ent_user_milk" in ids
    assert "ent_legacy" in ids  # NULL counts as live by design
    assert "ent_demo_eggs" not in ids


def test_apply_filter_demo_returns_only_demo_rows(db):
    """Demo mode strictly requires the demo: prefix — NULL legacy rows
    are NOT treated as demo (they could be old user uploads)."""
    from sqlalchemy import select

    _seed_three_scopes(db)
    q = apply_filter(select(ProductEntity), ProductEntity.source_run_id, Scope.DEMO)
    rows = list(db.scalars(q))
    ids = {r.id for r in rows}
    assert ids == {"ent_demo_eggs"}


def test_apply_filter_all_is_a_noop(db):
    """Scope.ALL leaves the query unchanged — defaults to backward-compat."""
    from sqlalchemy import select

    _seed_three_scopes(db)
    q = apply_filter(select(ProductEntity), ProductEntity.source_run_id, Scope.ALL)
    rows = list(db.scalars(q))
    assert len(rows) == 3  # all three seeded rows visible


def test_entities_endpoint_honors_scope_live(db):
    """Hitting /entities?scope=live returns only user-scoped + NULL rows.

    This is the real architectural change — Live mode is no longer a
    frontend filter; it's a DB filter the backend enforces.
    """
    _seed_three_scopes(db)
    client = TestClient(app)

    res_all = client.get("/api/v1/product-graph/entities?limit=100")
    res_live = client.get("/api/v1/product-graph/entities?scope=live&limit=100")
    res_demo = client.get("/api/v1/product-graph/entities?scope=demo&limit=100")

    assert res_all.status_code == 200
    assert res_live.status_code == 200
    assert res_demo.status_code == 200

    all_ids = {e["id"] for e in res_all.json()["entities"]}
    live_ids = {e["id"] for e in res_live.json()["entities"]}
    demo_ids = {e["id"] for e in res_demo.json()["entities"]}

    # ALL contains everything we seeded
    assert {"ent_demo_eggs", "ent_user_milk", "ent_legacy"}.issubset(all_ids)
    # LIVE excludes demo, includes user + legacy
    assert "ent_demo_eggs" not in live_ids
    assert "ent_user_milk" in live_ids
    assert "ent_legacy" in live_ids
    # DEMO strictly demo:*
    assert "ent_demo_eggs" in demo_ids
    assert "ent_user_milk" not in demo_ids
    assert "ent_legacy" not in demo_ids


def test_entities_endpoint_default_no_scope_is_backward_compatible(db):
    """No `?scope=` query → behaves exactly as before the migration.
    Critical for any existing client code (or older bookmark) to keep
    working after this change ships."""
    _seed_three_scopes(db)
    client = TestClient(app)

    res = client.get("/api/v1/product-graph/entities?limit=100")
    assert res.status_code == 200
    body = res.json()
    # All 3 entities visible by default — backwards-compatible
    ids = {e["id"] for e in body["entities"]}
    assert {"ent_demo_eggs", "ent_user_milk", "ent_legacy"}.issubset(ids)
