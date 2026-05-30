#!/usr/bin/env python3
"""ShelfTrace MCP server — the execution-reliability layer, exposed to agents.

WHY THIS EXISTS
---------------
An AI grocery-pricing agent decides *what* price to set. ShelfTrace answers the
question that has to come next: *did that approved price actually reach the
shopper, on every channel, and is the outcome trustworthy enough to learn from?*

This server exposes ShelfTrace's read-only reliability surface over the Model
Context Protocol so an agent (or any MCP client) can ground its decisions in
traceable execution evidence instead of black-box outputs:

    • shelftrace_list_batches            — discover price batches
    • shelftrace_get_batch               — a batch + its action ids
    • shelftrace_get_decision_receipt    — the full Signal→…→Learned evidence chain
    • shelftrace_is_execution_verified   — did every shopper-facing channel agree?
    • shelftrace_is_measurement_eligible — the quality GATE: only learn from verified execution
    • shelftrace_list_regression_cases   — Override Memory (resolved failures that guard future batches)
    • shelftrace_explain                 — deterministic, evidence-grounded plain-English answer

HONESTY
-------
This is an independent prototype. It serves ShelfTrace's OWN simulated/demo data
(seeded scenarios, synthetic prices, simulated POS / shelf-label / ecommerce
connectors). It has NO affiliation with, and NO connection to, any real retailer
or pricing vendor. Every tool is READ-ONLY — no tool mutates state.

ISOLATION
---------
Standalone, opt-in entrypoint. It is intentionally NOT imported by the FastAPI
app or the test suite, so the MCP SDK stays an optional dependency and the
backend's tests/build never depend on it. It reuses the EXISTING services
(receipt / measurement / regression / operations.explain) — no new logic.

RUN
---
    pip install "mcp"                      # optional dependency (see pyproject [mcp] extra)
    DATABASE_URL=<your shelftrace db> python -m app.mcp_server

Register with an MCP client (e.g. Claude Desktop / Claude Code) — see README.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Iterator, Optional

try:
    from mcp.server.fastmcp import FastMCP
except ModuleNotFoundError as exc:  # pragma: no cover - install-time guard
    raise SystemExit(
        "The ShelfTrace MCP server needs the MCP SDK, which is an optional "
        "dependency. Install it with:\n\n    pip install mcp\n\n"
        "(or, from the backend dir:  pip install '.[mcp]')"
    ) from exc

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models import PriceAction, PriceBatch
from app.routers.operations import explain as _explain_endpoint
from app.schemas import ExplainRequest
from app.services import measurement, receipt, regression

mcp = FastMCP("shelftrace_mcp")

# Read-only annotations shared by every tool (this server never mutates state and
# only touches ShelfTrace's own database — never an external system).
_READ_ONLY = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}


# ---------------------------------------------------------------------------
# Shared helpers (DRY — every tool reuses these)
# ---------------------------------------------------------------------------
@contextmanager
def _session() -> Iterator[Session]:
    """Open a short-lived DB session bound to whatever DATABASE_URL points at."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _load_action(db: Session, action_id: str) -> Optional[PriceAction]:
    return db.get(PriceAction, action_id)


def _action_not_found(action_id: str) -> str:
    return (
        f"Error: no price action found with id '{action_id}'. "
        "Call shelftrace_list_batches to find a batch, then shelftrace_get_batch "
        "to list that batch's action ids."
    )


def _dump(payload: object) -> str:
    return json.dumps(payload, indent=2, default=str)


# ---------------------------------------------------------------------------
# Input models (Pydantic validation per FastMCP best practice)
# ---------------------------------------------------------------------------
class ScopeInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    scope: Optional[str] = Field(
        default="demo",
        description="Data scope: 'demo' (seeded scenarios — the default), 'live' "
        "(operator-uploaded only), or 'all'.",
    )


class BatchIdInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    external_id: str = Field(
        ...,
        description="The batch external id, e.g. 'milk-hero-dallas-02'. Get one from shelftrace_list_batches.",
        min_length=1,
        max_length=128,
    )


class ActionIdInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    action_id: str = Field(
        ...,
        description="A price action id (e.g. 'action_…'). Get one from shelftrace_get_batch.",
        min_length=1,
        max_length=128,
    )


class ExplainInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    query: str = Field(
        ...,
        description="A natural-language question, e.g. 'Why is Dallas Zone 2 blocked?' "
        "or 'What is the strawberry markdown deadline?'",
        min_length=1,
        max_length=500,
    )


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------
@mcp.tool(name="shelftrace_list_batches", annotations={"title": "List price batches", **_READ_ONLY})
def shelftrace_list_batches(params: ScopeInput) -> str:
    """List the price batches ShelfTrace has executed (newest first) — the entry point for discovery.

    Use this first to find a batch, then call shelftrace_get_batch for its action ids.

    Returns: JSON list of {external_id, name, zone, status, expansion_blocked, block_reason}.
    """
    try:
        with _session() as db:
            batches = list(
                db.scalars(select(PriceBatch).order_by(PriceBatch.created_at.desc()))
            )
            rows = [
                {
                    "external_id": b.external_id,
                    "name": b.name,
                    "zone": b.zone,
                    "status": b.status.value,
                    "expansion_blocked": b.expansion_blocked,
                    "block_reason": b.block_reason,
                }
                for b in batches
            ]
            return _dump({"count": len(rows), "batches": rows})
    except Exception as e:  # pragma: no cover - defensive
        return f"Error: could not list batches: {type(e).__name__}: {e}"


@mcp.tool(name="shelftrace_get_batch", annotations={"title": "Get a batch and its actions", **_READ_ONLY})
def shelftrace_get_batch(params: BatchIdInput) -> str:
    """Get one price batch plus the list of its price actions (with their ids).

    Returns: JSON {external_id, name, zone, status, actions: [{action_id, sku,
    product_name, store_id, approved_price, prior_price, decision}]}. Feed an
    action_id into shelftrace_get_decision_receipt / _is_execution_verified /
    _is_measurement_eligible.
    """
    try:
        with _session() as db:
            batch = db.scalar(
                select(PriceBatch).where(PriceBatch.external_id == params.external_id)
            )
            if batch is None:
                return (
                    f"Error: no batch found with external_id '{params.external_id}'. "
                    "Call shelftrace_list_batches to see valid ids."
                )
            actions = [
                {
                    "action_id": a.id,
                    "sku": a.sku,
                    "product_name": a.product_name,
                    "store_id": a.store_id,
                    "approved_price": a.approved_price,
                    "prior_price": a.prior_price,
                    "decision": a.decision.value,
                }
                for a in batch.actions
            ]
            return _dump(
                {
                    "external_id": batch.external_id,
                    "name": batch.name,
                    "zone": batch.zone,
                    "status": batch.status.value,
                    "expansion_blocked": batch.expansion_blocked,
                    "action_count": len(actions),
                    "actions": actions,
                }
            )
    except Exception as e:  # pragma: no cover - defensive
        return f"Error: could not load batch: {type(e).__name__}: {e}"


@mcp.tool(name="shelftrace_get_decision_receipt", annotations={"title": "Get a Decision Receipt", **_READ_ONLY})
def shelftrace_get_decision_receipt(params: ActionIdInput) -> str:
    """Get the full Decision Receipt for one price action — its end-to-end evidence chain.

    The receipt threads the eight lifecycle stages (Signal → Match → Approved →
    Certified → Published → Verified → Measured → Learned) into one causal,
    read-only record, including per-channel reconciliation, linked incidents,
    measurement eligibility, and the audit trail. ``stopped_at_stage`` names the
    first stage that failed (null when nothing failed).

    Returns: JSON of the DecisionReceiptView (product/sku/store/zone, approved_price,
    outcome, stopped_at_stage, channels[], measurement_eligibility, incidents[],
    stages[], audit[]).
    """
    try:
        with _session() as db:
            action = _load_action(db, params.action_id)
            if action is None:
                return _action_not_found(params.action_id)
            return _dump(receipt.decision_receipt(db, action).model_dump())
    except Exception as e:  # pragma: no cover - defensive
        return f"Error: could not build decision receipt: {type(e).__name__}: {e}"


@mcp.tool(name="shelftrace_is_execution_verified", annotations={"title": "Is execution verified?", **_READ_ONLY})
def shelftrace_is_execution_verified(params: ActionIdInput) -> str:
    """Did the approved price actually reach the shopper on EVERY required channel?

    The core reliability check: compares each shopper-facing channel's observed
    price against the approved price. ``verified`` is true only when every channel
    acknowledged the approved price; otherwise ``blocked_channel`` names the first
    channel that disagreed.

    Returns: JSON {action_id, product, approved_price, verified (bool),
    outcome, stopped_at_stage, blocked_channel, channels: [{channel, status,
    expected_price, observed_price}]}.
    """
    try:
        with _session() as db:
            action = _load_action(db, params.action_id)
            if action is None:
                return _action_not_found(params.action_id)
            rcpt = receipt.decision_receipt(db, action)
            channels = [
                {
                    "channel": c.channel,
                    "status": c.status,
                    "expected_price": c.expected_price,
                    "observed_price": c.observed_price,
                }
                for c in rcpt.channels
            ]
            blocked = next(
                (c for c in channels if c["status"] in ("mismatch", "timeout")), None
            )
            verified = bool(channels) and all(c["status"] == "verified" for c in channels)
            return _dump(
                {
                    "action_id": action.id,
                    "product": rcpt.product_name,
                    "store_id": rcpt.store_id,
                    "approved_price": rcpt.approved_price,
                    "verified": verified,
                    "outcome": rcpt.outcome,
                    "stopped_at_stage": rcpt.stopped_at_stage,
                    "blocked_channel": blocked["channel"] if blocked else None,
                    "channels": channels,
                }
            )
    except Exception as e:  # pragma: no cover - defensive
        return f"Error: could not check execution: {type(e).__name__}: {e}"


@mcp.tool(name="shelftrace_is_measurement_eligible", annotations={"title": "Is the action eligible to learn from?", **_READ_ONLY})
def shelftrace_is_measurement_eligible(params: ActionIdInput) -> str:
    """The QUALITY GATE: is this action's outcome trustworthy enough to measure / learn from?

    ShelfTrace's north star: an agent should only be trained on price actions whose
    shopper-facing execution was actually VERIFIED. This derives the eligibility
    state from real receipt + incident + recovery evidence:
      • ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED — safe to attribute / learn from
      • INELIGIBLE_EXECUTION_NOT_VERIFIED       — a channel rang the wrong price
      • INELIGIBLE_AWAITING_ACKNOWLEDGEMENT      — still retrying / awaiting ack
      • EXCLUDED_RECOVERY_INCOMPLETE             — rolled back / human task open

    Returns: JSON {action_id, eligible (bool), status, reason, blocked_channel,
    required_channels, verified_channels, summary}.
    """
    try:
        with _session() as db:
            action = _load_action(db, params.action_id)
            if action is None:
                return _action_not_found(params.action_id)
            result = measurement.derive_eligibility_for_action(db, action)
            payload = result.to_dict()
            payload["action_id"] = action.id
            payload["eligible"] = (
                result.status
                == measurement.MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED
            )
            return _dump(payload)
    except Exception as e:  # pragma: no cover - defensive
        return f"Error: could not derive eligibility: {type(e).__name__}: {e}"


@mcp.tool(name="shelftrace_list_regression_cases", annotations={"title": "List Override Memory / regression cases", **_READ_ONLY})
def shelftrace_list_regression_cases() -> str:
    """List ShelfTrace's Override Memory — resolved failures captured as durable regression cases.

    Each case is a failure mode learned from a recovered incident (e.g. a POS
    price mismatch) that now guards future batches. This is the agent's
    institutional memory: what has gone wrong before, and what must hold now.

    Returns: JSON list of {id, case_type, title, failure_signature,
    expected_behavior, status, sku, store_id, channel, last_replayed_at}.
    """
    try:
        with _session() as db:
            cases = regression.list_cases(db)
            rows = [
                {
                    "id": c.id,
                    "case_type": c.case_type.value,
                    "title": c.title,
                    "failure_signature": c.failure_signature,
                    "expected_behavior": c.expected_behavior,
                    "status": c.status.value,
                    "sku": c.sku,
                    "store_id": c.store_id,
                    "channel": c.channel,
                    "last_replayed_at": c.last_replayed_at,
                }
                for c in cases
            ]
            return _dump({"count": len(rows), "regression_cases": rows})
    except Exception as e:  # pragma: no cover - defensive
        return f"Error: could not list regression cases: {type(e).__name__}: {e}"


@mcp.tool(name="shelftrace_explain", annotations={"title": "Explain current state (deterministic)", **_READ_ONLY})
def shelftrace_explain(params: ExplainInput) -> str:
    """Ask ShelfTrace a plain-English question and get a DETERMINISTIC, evidence-grounded answer.

    NOT AI-generated: every sentence is assembled from real rows (incidents,
    actions, channel receipts). The query is used only to route to the right
    template (e.g. 'block'/'zone' → why a zone is held; 'strawberry'/'deadline'
    → the markdown deadline). Answers reflect demo-scope data.

    Returns: JSON {answer, evidence_chips, zone_status, measurement_gate}.
    """
    try:
        with _session() as db:
            resp = _explain_endpoint(ExplainRequest(query=params.query), "demo", db)
            return _dump(resp.model_dump())
    except Exception as e:  # pragma: no cover - defensive
        return f"Error: could not explain: {type(e).__name__}: {e}"


def _ensure_schema() -> None:
    """Idempotently provision any missing tables before serving.

    Unlike the FastAPI app (app/main.py) and the worker (app/worker.py), this
    standalone entrypoint may be the FIRST thing to touch the database — e.g. an
    MCP client launches it against a DB file that predates a newer model. Every
    app.models class is registered on Base.metadata via the imports above, so
    create_all() adds only missing tables and never alters or drops existing
    data. This makes the server self-sufficient on a fresh clone or a stale DB.
    """
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":  # pragma: no cover - entrypoint
    # stdio transport — the canonical local MCP integration. An MCP client
    # (Claude Desktop / Claude Code / etc.) launches this as a subprocess.
    _ensure_schema()
    mcp.run()
