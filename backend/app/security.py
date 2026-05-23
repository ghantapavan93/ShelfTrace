"""API-key authentication + identity model.

Design constraints:

  • The existing tests don't set auth headers. The demo and frontend don't
    either. So when ``settings.api_keys_json`` is empty (the default), auth
    is *bypassed* and every dependency resolves to the historical default
    identity (``Identity(role="operator", actor="operator")``). This preserves
    backwards-compat with the demo, the tests, and the frontend.

  • When ``settings.api_keys_json`` is set, it becomes enforced. Format:

        {
          "op-key-7f4a": {"role": "operator", "actor": "Avery Davis"},
          "view-key-22": {"role": "viewer",   "actor": "Recruiter Sandbox"}
        }

    Clients pass ``X-API-Key: op-key-7f4a``. The resolved ``Identity.actor``
    is threaded into ``record_audit`` so the trail captures who actually
    performed the action — not the hard-coded "operator" string.

  • ``X-Actor-Name`` is optional and only honored for operators (lets a
    single shared operator key represent multiple humans in the demo).

CSRF
----
This API is intentionally CSRF-safe-by-construction when API keys are
configured: every mutating endpoint requires the custom ``X-API-Key``
header, which browsers cannot set on cross-origin requests without a CORS
preflight (the simple-request rules forbid custom headers). Combined with
the explicit CORS allowlist in ``main.py``, a malicious site cannot trick
an authenticated browser into POSTing as an operator. No CSRF token is
required, and we deliberately do not accept API keys via cookies or query
strings — only the header.

When ``API_KEYS_JSON`` is empty (the demo default), the API runs open and
is only safe for local / trusted-network use. The startup log warns about
this explicitly.

Roles:
  • operator — may perform any write (ingest, expand, retry/rollback/resolve,
    create scenarios, demo reset, certification).
  • viewer   — may call any read endpoint when reads are protected (none are
    today, for portfolio reasons; the dep is exposed so a future commit can
    drop it onto GET endpoints without further plumbing).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException, status

from app.config import settings

logger = logging.getLogger("shelftrace.security")


@dataclass(frozen=True)
class Identity:
    role: str          # "operator" | "viewer" | "system"
    actor: str         # human-readable name recorded in the audit trail
    key_label: str     # the API-key id used (or "unauthenticated" / "system")


# Default identity used when auth is bypassed — preserves prior audit output.
ANONYMOUS_OPERATOR = Identity(role="operator", actor="operator", key_label="unauthenticated")
SYSTEM = Identity(role="system", actor="system", key_label="system")


def _load_key_map() -> dict[str, dict[str, str]]:
    raw = (settings.api_keys_json or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise ValueError("api_keys_json must be a JSON object")
        return parsed
    except (json.JSONDecodeError, ValueError) as exc:  # pragma: no cover - config error
        logger.error("Invalid api_keys_json (%s) — running with auth DISABLED", exc)
        return {}


def auth_enabled() -> bool:
    """True if any API key is configured; otherwise the API runs open."""
    return bool(_load_key_map())


def _resolve(x_api_key: Optional[str], x_actor_name: Optional[str]) -> Optional[Identity]:
    """Look the key up; return Identity on hit, None on miss."""
    keys = _load_key_map()
    if not keys:
        return ANONYMOUS_OPERATOR
    if not x_api_key:
        return None
    entry = keys.get(x_api_key)
    if not entry:
        return None
    role = entry.get("role", "viewer")
    actor = entry.get("actor", role)
    # Operators may override their display name (lets one shared op-key represent
    # multiple humans during a demo). Viewers cannot — we don't want a viewer
    # pretending to be the on-call operator in the audit trail.
    if role == "operator" and x_actor_name:
        actor = x_actor_name
    return Identity(role=role, actor=actor, key_label=x_api_key[:8] + "…")


def require_any(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    x_actor_name: Optional[str] = Header(default=None, alias="X-Actor-Name"),
) -> Identity:
    """Any valid key (operator or viewer). When auth is disabled, returns the
    anonymous-operator identity so legacy callers keep working."""
    identity = _resolve(x_api_key, x_actor_name)
    if identity is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-API-Key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return identity


def require_operator(
    identity: Identity = Depends(require_any),
) -> Identity:
    """Operator role required. When auth is disabled (no keys configured),
    ``require_any`` already returned the anonymous-operator identity, so this
    is a no-op in that case."""
    if identity.role != "operator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Operator role required (have: {identity.role})",
        )
    return identity
