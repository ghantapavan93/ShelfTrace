"""Backend data-scope helpers — the real Live/Demo boundary.

This module replaces the frontend-filter approximation of Live mode with
a deterministic backend contract:

  • Every row that crosses the demo-showcase / user-uploaded line carries
    an explicit `source_run_id` string in the format `<bucket>:<key>`.
  • Bucket is exactly one of: 'demo', 'user'.
  • Key is opaque to the platform; for user data it's typically a sha256
    prefix of the upload payload so the same CSV always lands in the
    same scope.

Public surface:
  Scope            — string constants for well-known sources
  current_scope()  — resolves the scope filter requested by the caller
                     based on a `?scope=` query param. Defaults to ALL.
  build_demo_id()  — constructs a 'demo:<key>' id with consistent format.
  build_user_id()  — constructs a 'user:<key>' id from a payload hash.
  apply_filter(query, model, scope)  — composable filter helper for
                                       SQLAlchemy queries.

Callers should NEVER hand-parse source_run_id strings. Use the helpers.
"""
from __future__ import annotations

import hashlib
from enum import Enum
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.sql import ColumnElement, Select


class Scope(str, Enum):
    """Three intended request modes from the client.

    ALL  : no filter — include both demo and user data. Default when
           the client doesn't specify (preserves legacy behavior).
    DEMO : only seeded showcase data (source_run_id LIKE 'demo:%').
    LIVE : only user-uploaded data (source_run_id LIKE 'user:%' OR NULL
           legacy rows in case a tenant's old uploads haven't been
           backfilled yet).
    """

    ALL = "all"
    DEMO = "demo"
    LIVE = "live"

    @classmethod
    def from_query(cls, value: Optional[str]) -> "Scope":
        if not value:
            return cls.ALL
        v = value.strip().lower()
        if v in (cls.DEMO.value, cls.LIVE.value, cls.ALL.value):
            return cls(v)
        # Unknown scope strings → safe default
        return cls.ALL


# Well-known source IDs the platform stamps itself
DEMO_MEMORIAL_DAY = "demo:memorial-day"
DEMO_REALISTIC_SCALE = "demo:realistic-scale"
DEMO_CERTIFICATION = "demo:certification"

# Catch-all for rows that existed before the migration backfilled. Live
# mode includes these alongside fresh user uploads because we can't
# unilaterally classify legacy rows as demo.
USER_LEGACY = "user:legacy"


def current_scope(scope_param: Optional[str]) -> Scope:
    """Resolve a `?scope=...` query value into a Scope enum."""
    return Scope.from_query(scope_param)


def build_user_id(payload_bytes: bytes) -> str:
    """Build a stable user-scope id from upload bytes.

    Same CSV always lands in the same scope — useful for idempotency and
    for letting a user re-upload to reconcile against an earlier batch.
    """
    sha = hashlib.sha256(payload_bytes).hexdigest()[:16]
    return f"user:{sha}"


def build_demo_id(key: str) -> str:
    """Build a 'demo:<key>' id with consistent formatting."""
    return f"demo:{key.strip().lower().replace(' ', '-')}"


def apply_filter(query: Select, source_col: ColumnElement, scope: Scope) -> Select:
    """Compose a `WHERE source_run_id LIKE 'demo:%' / 'user:%' / 1=1` clause.

    Live includes NULL rows so legacy data isn't lost. Demo strictly
    requires the demo: prefix.
    """
    if scope == Scope.DEMO:
        return query.where(source_col.like("demo:%"))
    if scope == Scope.LIVE:
        # User uploads OR legacy NULL (we can't claim legacy is demo).
        return query.where(or_(source_col.like("user:%"), source_col.is_(None)))
    return query  # Scope.ALL: no-op
