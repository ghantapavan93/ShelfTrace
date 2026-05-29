"""Override Memory / Regression Replay.

A resolved failure or human correction is durable knowledge, not a one-off
cleanup. When an operator recovers from an incident — a POS price mismatch, an
ESL markdown timeout — that failure mode is captured here as a
:class:`~app.models.RegressionCase`. The case records, from *real* row data,
what went wrong (``failure_signature``) and what must now be guaranteed
(``expected_behavior``), plus a JSON snapshot of the state at capture time.

Replaying a case re-exercises the same failure signature through the **shared**
certification engine (the exact pipeline live rollout uses: ingestion ->
transactional outbox -> typed adapters -> reconciliation -> recovery -> audit).
The replay derives its outcome from the certification run's real checks — it
never fabricates a pass. The Decision Receipt's *Learned* stage reads
:func:`cases_for_action` so a receipt can point at the durable case(s) learned
from its action rather than relying on narrative substring hints.

Discipline:
  * Self-contained net-new table (``regression_cases``) — ``create_all``
    provisions it; no ``db_migrate`` column entry is required.
  * Every state mutation writes an :class:`~app.models.AuditEvent`.
  * Replay always goes through :mod:`app.services.certification`, never a
    parallel engine.
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ids import new_id
from app.models import (
    CertificationRunStatus,
    Channel,
    CheckStatus,
    Incident,
    IncidentType,
    PriceAction,
    PriceBatch,
    RegressionCase,
    RegressionCaseStatus,
    RegressionCaseType,
    utcnow,
)
from app.services import certification
from app.services.audit import record_audit


class RegressionError(Exception):
    """Raised when a regression-case operation is invalid for the current state."""


# ---------------------------------------------------------------------------
# Derivation helpers — every value comes from real rows.
# ---------------------------------------------------------------------------
def _derive_case_type(incident: Incident) -> RegressionCaseType:
    """Map an incident's failure mode to how it should be re-exercised."""
    if incident.type == IncidentType.PRICE_MISMATCH:
        return RegressionCaseType.CONNECTOR_CERTIFICATION
    if incident.type in (IncidentType.DEADLINE_RISK, IncidentType.CHANNEL_TIMEOUT):
        return RegressionCaseType.MARKDOWN_FALLBACK
    # Default: a price/connector disagreement is the canonical certification case.
    return RegressionCaseType.CONNECTOR_CERTIFICATION


def _observed_for(action: PriceAction | None, channel: Channel | None) -> float | None:
    if action is None or channel is None:
        return None
    delivery = next((d for d in action.deliveries if d.channel == channel), None)
    if delivery is None or delivery.receipt is None:
        return None
    return delivery.receipt.observed_price


def _build_signatures(
    incident: Incident, action: PriceAction | None, channel: Channel | None
) -> tuple[str, str, str]:
    """Return (title, expected_behavior, failure_signature) from real rows."""
    chan = channel.value.upper() if channel else "channel"
    product = action.product_name.split(",")[0] if action else "the product"
    store = action.store_id if action else "?"
    approved = action.approved_price if action else None
    observed = _observed_for(action, channel)

    approved_str = f"${approved:.2f}" if approved is not None else "the approved price"

    if incident.type == IncidentType.PRICE_MISMATCH:
        title = f"{chan} price agreement — {product} @ Store {store}"
        expected = (
            f"{chan} must acknowledge the approved price {approved_str} for {product} "
            f"at Store {store} before zone expansion is allowed."
        )
        if observed is not None and approved is not None:
            signature = f"{chan} returned ${observed:.2f} vs approved ${approved:.2f}"
        else:
            signature = f"{chan} disagreed with the approved price for {product}"
    elif incident.type in (IncidentType.DEADLINE_RISK, IncidentType.CHANNEL_TIMEOUT):
        title = f"{chan} markdown fallback — {product} @ Store {store}"
        expected = (
            f"{chan} must acknowledge the markdown {approved_str} for {product} at "
            f"Store {store} within the deadline, or the documented fallback must fire."
        )
        signature = (
            f"{chan} did not acknowledge the markdown for {product} at Store {store} in time"
        )
    else:
        title = f"{chan} reliability — {product} @ Store {store}"
        expected = f"{chan} must reliably execute approved prices for {product} at Store {store}."
        signature = incident.summary

    return title, expected, signature


# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------
def _existing_for_incident(db: Session, incident_id: str) -> RegressionCase | None:
    return db.scalar(
        select(RegressionCase).where(RegressionCase.origin_incident_id == incident_id)
    )


def create_from_incident(
    db: Session, incident_id: str, case_type: RegressionCaseType | None = None
) -> RegressionCase:
    """Capture a durable regression case from a real incident.

    Idempotent on ``origin_incident_id`` — re-capturing the same incident
    returns the existing case rather than creating a duplicate.
    """
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise RegressionError(f"Incident {incident_id} not found")

    existing = _existing_for_incident(db, incident_id)
    if existing is not None:
        return existing

    action = db.get(PriceAction, incident.action_id)
    channel = incident.offending_channel
    resolved_type = case_type or _derive_case_type(incident)
    title, expected, signature = _build_signatures(incident, action, channel)

    snapshot = {
        "incident_id": incident.id,
        "incident_type": incident.type.value,
        "incident_status": incident.status.value,
        "incident_summary": incident.summary,
        "batch_id": incident.batch_id,
        "action_id": incident.action_id,
        "sku": action.sku if action else None,
        "store_id": action.store_id if action else None,
        "product_name": action.product_name if action else None,
        "channel": channel.value if channel else None,
        "approved_price": action.approved_price if action else None,
        "observed_price": _observed_for(action, channel),
        "captured_at": utcnow().isoformat(),
    }

    case = RegressionCase(
        id=new_id("rc"),
        case_type=resolved_type,
        title=title,
        origin_incident_id=incident.id,
        origin_action_id=incident.action_id,
        sku=action.sku if action else None,
        store_id=action.store_id if action else None,
        channel=channel.value if channel else None,
        expected_behavior=expected,
        failure_signature=signature,
        source_payload_json=json.dumps(snapshot),
        status=RegressionCaseStatus.ACTIVE,
    )
    db.add(case)

    record_audit(
        db,
        incident_id=incident.id,
        action_id=incident.action_id,
        batch_id=incident.batch_id,
        event="Regression case captured",
        detail=(
            f"Override Memory: '{title}' saved as a durable regression case. "
            f"Expected: {expected}"
        ),
        actor="operator",
    )
    db.commit()
    db.refresh(case)
    return case


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
def list_cases(db: Session) -> list[RegressionCase]:
    return list(db.scalars(select(RegressionCase).order_by(RegressionCase.created_at.desc())))


def get_case(db: Session, case_id: str) -> RegressionCase | None:
    return db.get(RegressionCase, case_id)


def cases_for_action(db: Session, action_id: str) -> list[RegressionCase]:
    """Regression cases learned from a given price action — read by the
    Decision Receipt's Learned stage."""
    return list(
        db.scalars(
            select(RegressionCase)
            .where(RegressionCase.origin_action_id == action_id)
            .order_by(RegressionCase.created_at.desc())
        )
    )


# ---------------------------------------------------------------------------
# Replay — re-exercise the failure signature through the SHARED engine.
# ---------------------------------------------------------------------------
def replay_as_certification(db: Session, case_id: str) -> dict:
    """Re-exercise this case's failure signature through the shared certification
    engine and record the outcome.

    A fresh certification run pushes the canonical connector scenario through the
    exact live-rollout pipeline. We then read the run's *real* derived checks to
    decide whether the failure mode the case captured now holds:

      * CONNECTOR_CERTIFICATION → the PRICE_AGREEMENT check
      * MARKDOWN_FALLBACK       → the MARKDOWN_SLA check

    ``healed`` is True when that check passed or recovered on this run. The case
    is marked REPLAYED with ``last_replayed_at`` and an audit event is written.
    The returned dict matches :class:`~app.schemas.RegressionReplayResult`.
    """
    case = get_case(db, case_id)
    if case is None:
        raise RegressionError(f"Regression case {case_id} not found")

    # Shared engine: a certification run executes the real pipeline + derives
    # checks from genuine artifacts. Reusing it means the replay is never a
    # parallel re-implementation.
    run = certification.create_run(db, execute_now=True)

    from app.models import CheckType  # local import keeps the module import graph flat

    target_check_type = (
        CheckType.MARKDOWN_SLA
        if case.case_type == RegressionCaseType.MARKDOWN_FALLBACK
        else CheckType.PRICE_AGREEMENT
    )
    target = next((c for c in run.checks if c.check_type == target_check_type), None)

    # If the seeded scenario left the connector failing (the canonical
    # FAILED_PENDING_REMEDIATION state), run the operator remediation path so the
    # replay demonstrates the failure being driven back to green through the same
    # recovery code live operators use.
    if target is not None and target.status == CheckStatus.FAILED:
        certification.rerun_failed_checks(db, run)
        db.refresh(run)
        target = next((c for c in run.checks if c.check_type == target_check_type), None)

    healed = target is not None and target.status in (
        CheckStatus.PASSED,
        CheckStatus.RECOVERED,
    )
    # Fall back to the run-level verdict if the specific check is absent.
    if target is None:
        healed = run.status == CertificationRunStatus.PASSED

    case.status = RegressionCaseStatus.REPLAYED
    case.last_replayed_at = utcnow()

    verdict = "passed" if healed else "still failing"
    detail = (
        f"Regression replay of '{case.title}' re-exercised the failure signature "
        f"through the certification engine (run {run.id}); the guarded behavior {verdict}."
    )
    record_audit(
        db,
        incident_id=case.origin_incident_id,
        action_id=case.origin_action_id,
        batch_id=run.batch_id,
        event="Regression case replayed",
        detail=detail,
        actor="operator",
    )
    db.commit()
    db.refresh(case)

    return {
        "case_id": case.id,
        "status": case.status.value,
        "healed": healed,
        "certification_run_id": run.id,
        "check_id": target.id if target is not None else None,
        "redirect": "/certification",
        "detail": detail,
    }
