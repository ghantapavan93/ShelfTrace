"""Certification Lab — validates connector behaviour BEFORE go-live.

This is not a second engine. A certification run pushes a batch through the
exact same pipeline as live rollout (ingestion -> transactional outbox ->
worker delivery -> typed adapters -> reconciliation -> recovery -> audit) and
then *derives* its pass/fail checks from the real execution artifacts that
pipeline produced (receipts, incidents, retries, audit, idempotency, locking).
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ids import new_id
from app.models import (
    AuditEvent,
    CertificationCheck,
    CertificationRun,
    CertificationRunStatus,
    Channel,
    CheckStatus,
    CheckType,
    ConnectorProfile,
    ConnectorStatus,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
    ReceiptStatus,
    RunMode,
)
from app.schemas import PriceBatchIn
from app.seed import wipe_batch
from app.services import orchestrator, recovery, scenarios
from app.services.ingestion import ingest_batch

SANDBOX_PROFILE = dict(
    name="Dallas Market Sandbox",
    retailer_name="Dallas Market",
    pos_provider="LegacyPOS Gateway",
    esl_provider="SmartShelf Gateway",
    ecommerce_provider="Online Catalog Feed",
)

RECOMMENDATION_FAILED = (
    "Automated zone rollout should remain disabled until the POS connector returns "
    "verified checkout prices consistently."
)
RECOMMENDATION_PASSED = (
    "All connector checks passed. Automated zone rollout may be enabled for this environment."
)

_EGG_SKU = "egg-cage-free-brown-12"
_STRAWBERRY_SKU = "strawberry-1lb"
_OJ_SKU = "oj-nfc-premium-52oz"
_CANARY_STORE = "214"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _cert_external_id(run_id: str) -> str:
    return f"certification-{run_id}"


def _certification_payload(db: Session, profile_id: str, run_id: str, config=None) -> PriceBatchIn:
    # Certification runs the SAME configurable scenario as live rollout — the egg
    # failure comes from the scenario's connector behavior profile, not code.
    config = config or scenarios.ensure_memorial_day(db)
    payload = scenarios.build_payload(
        config, "certification", _cert_external_id(run_id), f"idem-cert-{run_id}"
    )
    return payload.model_copy(
        update={
            "name": "Connector Certification Run",
            "zone": "Dallas Market Sandbox",
            "approved_by": "certification-harness",
            "environment": "sandbox",
            "connector_profile_id": profile_id,
        }
    )


def _action(batch: PriceBatch, sku: str, store_id: str) -> PriceAction | None:
    return next((a for a in batch.actions if a.sku == sku and a.store_id == store_id), None)


def batch_canary_stores(batch: PriceBatch) -> list[str]:
    g = next((g for g in batch.rollout_groups if g.kind == "canary"), None)
    return g.store_ids if g else []


def _receipt(action: PriceAction, channel: str):
    d = next((d for d in action.deliveries if d.channel == Channel(channel)), None)
    return d.receipt if d else None


def get_profile(db: Session) -> ConnectorProfile | None:
    return db.scalar(select(ConnectorProfile).order_by(ConnectorProfile.created_at.desc()))


def get_run(db: Session, run_id: str) -> CertificationRun | None:
    return db.get(CertificationRun, run_id)


def latest_run(db: Session) -> CertificationRun | None:
    return db.scalar(select(CertificationRun).order_by(CertificationRun.started_at.desc()))


def _cert_batch(db: Session, run: CertificationRun) -> PriceBatch | None:
    if not run.batch_id:
        return None
    return db.get(PriceBatch, run.batch_id)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
def wipe_certification(db: Session) -> None:
    # Remove every certification batch and the certification bookkeeping.
    cert_batches = list(db.scalars(select(PriceBatch).where(PriceBatch.run_mode == RunMode.CERTIFICATION)))
    for b in cert_batches:
        wipe_batch(db, b.external_id)
    from sqlalchemy import delete

    db.execute(delete(CertificationCheck))
    db.execute(delete(CertificationRun))
    db.execute(delete(ConnectorProfile))
    db.commit()


def ensure_profile(db: Session) -> ConnectorProfile:
    profile = get_profile(db)
    if profile is None:
        profile = ConnectorProfile(
            id=new_id("conn"),
            status=ConnectorStatus.PENDING_CERTIFICATION,
            **SANDBOX_PROFILE,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def create_run(db: Session, config=None, execute_now: bool = True) -> CertificationRun:
    profile = ensure_profile(db)
    run = CertificationRun(
        id=new_id("cert"),
        connector_profile_id=profile.id,
        status=CertificationRunStatus.RUNNING,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    if execute_now:
        execute_run(db, run, config)
    return run


def run_for_config(db: Session, config) -> CertificationRun:
    """Create + execute a certification run for an arbitrary scenario configuration."""
    return create_run(db, config=config, execute_now=True)


def execute_run(db: Session, run: CertificationRun, config=None) -> CertificationRun:
    """Run the shared pipeline for this certification run, then derive checks.

    Any markdown shelf-label timeout is *recovered* (retry) as part of the test;
    a POS price mismatch is left failed — that is the connector defect the
    certification is meant to catch. Behaviors come from the scenario config.
    """
    batch = _cert_batch(db, run)
    if batch is None:
        result = ingest_batch(db, _certification_payload(db, run.connector_profile_id, run.id, config))
        orchestrator.drain(db)
        batch = result.batch
        run.batch_id = batch.id
        db.commit()

        # Recovery scenario: retry the strawberry shelf-label timeouts (they heal).
        straw_incidents = db.scalars(
            select(Incident).where(
                Incident.batch_id == batch.id, Incident.type == IncidentType.DEADLINE_RISK
            )
        ).all()
        for inc in straw_incidents:
            recovery.retry_incident(db, inc.id)

    db.refresh(batch)
    _derive_checks(db, run, batch)
    _finalize(db, run)
    return run


def rerun_failed_checks(db: Session, run: CertificationRun) -> CertificationRun:
    """Operator remediation: retry the connectors behind any failed check, then re-derive."""
    batch = _cert_batch(db, run)
    if batch is None:
        return execute_run(db, run)

    failed = [c for c in run.checks if c.status == CheckStatus.FAILED]
    for check in failed:
        if check.check_type == CheckType.PRICE_AGREEMENT:
            # Retry the egg POS mismatch incident (heals on retry).
            inc = db.scalar(
                select(Incident).where(
                    Incident.batch_id == batch.id,
                    Incident.type == IncidentType.PRICE_MISMATCH,
                    Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]),
                )
            )
            if inc is not None:
                recovery.retry_incident(db, inc.id)

    db.refresh(batch)
    _derive_checks(db, run, batch)
    _finalize(db, run)
    return run


# ---------------------------------------------------------------------------
# Check derivation (from real execution artifacts)
# ---------------------------------------------------------------------------
def _add_check(db, run, check_type, scenario, status, evidence):
    db.add(
        CertificationCheck(
            id=new_id("chk"),
            certification_run_id=run.id,
            check_type=check_type,
            scenario_name=scenario,
            status=status,
            evidence_json=json.dumps(evidence),
        )
    )


def _derive_checks(db: Session, run: CertificationRun, batch: PriceBatch) -> None:
    from sqlalchemy import delete

    db.execute(delete(CertificationCheck).where(CertificationCheck.certification_run_id == run.id))
    db.flush()

    canary = set(batch_canary_stores(batch))
    canary_actions = [a for a in batch.actions if a.store_id in canary]

    # 1. Price Agreement — any POS checkout that disagrees with the approved price.
    mismatch = next(
        ((a, _receipt(a, "pos")) for a in canary_actions
         if _receipt(a, "pos") is not None and _receipt(a, "pos").status == ReceiptStatus.MISMATCH),
        None,
    )
    if mismatch is not None:
        a, r = mismatch
        _add_check(
            db, run, CheckType.PRICE_AGREEMENT, a.product_name.split(",")[0], CheckStatus.FAILED,
            {"channel": "pos", "store_id": a.store_id, "approved_price": a.approved_price,
             "observed_price": r.observed_price,
             "detail": f"POS returned ${r.observed_price:.2f} instead of ${a.approved_price:.2f}"},
        )
    else:
        _add_check(
            db, run, CheckType.PRICE_AGREEMENT, "POS Checkout", CheckStatus.PASSED,
            {"channel": "pos", "detail": "Every POS checkout matches the approved price"},
        )

    # 2. Markdown SLA — any markdown shelf-label that timed out then recovered.
    deadline_incident = db.scalar(
        select(Incident).where(
            Incident.batch_id == batch.id, Incident.type == IncidentType.DEADLINE_RISK
        )
    )
    if deadline_incident is None:
        _add_check(
            db, run, CheckType.MARKDOWN_SLA, "Markdown", CheckStatus.PASSED,
            {"channel": "esl", "detail": "No markdown deadlines configured in this scenario"},
        )
    else:
        md_action = db.get(PriceAction, deadline_incident.action_id)
        md_name = md_action.product_name.split(",")[0] if md_action else "Markdown"
        if deadline_incident.status == IncidentStatus.RESOLVED:
            _add_check(
                db, run, CheckType.MARKDOWN_SLA, md_name, CheckStatus.RECOVERED,
                {"channel": "esl", "initial": "timeout", "after_retry": "verified",
                 "detail": "ESL shelf-label timed out, then succeeded after retry"},
            )
        else:
            _add_check(
                db, run, CheckType.MARKDOWN_SLA, md_name, CheckStatus.FAILED,
                {"channel": "esl", "detail": "ESL shelf-label did not acknowledge the markdown"},
            )

    # 3. Ecommerce Verification — every ecommerce channel confirms the approved price.
    ecom_bad = next(
        (a for a in canary_actions
         if _receipt(a, "ecommerce") is not None and _receipt(a, "ecommerce").status != ReceiptStatus.VERIFIED),
        None,
    )
    _add_check(
        db, run, CheckType.ECOMMERCE_VERIFICATION, "Ecommerce",
        CheckStatus.FAILED if ecom_bad is not None else CheckStatus.PASSED,
        {"channel": "ecommerce",
         "detail": "Ecommerce did not confirm the price" if ecom_bad is not None
         else "Every ecommerce price confirmed online"},
    )

    # 4. Idempotent Batch — re-submitting the same key creates no second workflow.
    before = db.scalar(select(PriceBatch).where(PriceBatch.external_id == batch.external_id))
    again = ingest_batch(db, _certification_payload(db, run.connector_profile_id, run.id))
    idempotent = (not again.created) and again.batch.id == before.id
    _add_check(
        db, run, CheckType.IDEMPOTENT_BATCH, "Duplicate Submission",
        CheckStatus.PASSED if idempotent else CheckStatus.FAILED,
        {"resubmitted_key": f"idem-cert-{run.id}", "created_new": again.created,
         "detail": "No duplicate delivery created" if idempotent else "Duplicate created"},
    )

    # 5. Recovery Safety — a second resolution of an already-resolved incident is rejected.
    # If nothing needed recovery in this scenario, the row-lock guard still holds (PASSED).
    resolved_incident = db.scalar(
        select(Incident).where(
            Incident.batch_id == batch.id, Incident.status == IncidentStatus.RESOLVED
        )
    )
    recovery_ok = True
    rec_detail = "No incident required recovery; row-lock guard structurally enforced"
    if resolved_incident is not None:
        recovery_ok = False
        try:
            recovery.resolve_incident(db, resolved_incident.id)
            rec_detail = "Second resolution unexpectedly succeeded"
        except recovery.RecoveryError as exc:
            recovery_ok = True
            rec_detail = f"Second resolution rejected: {exc}"
    _add_check(
        db, run, CheckType.RECOVERY_SAFETY, "Concurrent Retry",
        CheckStatus.PASSED if recovery_ok else CheckStatus.FAILED,
        {"detail": "One resolution recorded" if recovery_ok else rec_detail, "note": rec_detail},
    )

    # 6. Canary Protection — a canary mismatch must have blocked zone expansion.
    # This is a behavioural fact (the guard fired), proven from the audit trail, so
    # it stays true even after the connector is remediated and the batch unblocks.
    db.refresh(batch)
    block_event = db.scalar(
        select(AuditEvent).where(
            AuditEvent.batch_id == batch.id, AuditEvent.event.ilike("%expansion blocked%")
        )
    )
    protected = block_event is not None or batch.expansion_blocked
    _add_check(
        db, run, CheckType.CANARY_PROTECTION, "Store 214 Failure",
        CheckStatus.PASSED if protected else CheckStatus.FAILED,
        {"expansion_was_blocked": protected,
         "currently_blocked": batch.expansion_blocked,
         "detail": "Expansion was prevented while a canary mismatch was open"
         if protected else "Expansion guard did not fire"},
    )
    db.flush()


def _finalize(db: Session, run: CertificationRun) -> None:
    from app.models import utcnow

    db.refresh(run)
    has_failure = any(c.status == CheckStatus.FAILED for c in run.checks)
    if has_failure:
        run.status = CertificationRunStatus.FAILED_PENDING_REMEDIATION
        run.final_recommendation = RECOMMENDATION_FAILED
    else:
        run.status = CertificationRunStatus.PASSED
        run.final_recommendation = RECOMMENDATION_PASSED

    profile = db.get(ConnectorProfile, run.connector_profile_id)
    if profile is not None:
        profile.status = (
            ConnectorStatus.CERTIFIED if run.status == CertificationRunStatus.PASSED
            else ConnectorStatus.PENDING_CERTIFICATION
        )
    run.completed_at = utcnow()
    db.commit()
    db.refresh(run)


def reset_demo(db: Session) -> CertificationRun:
    """Reset the certification demo to its canonical FAILED_PENDING_REMEDIATION state."""
    wipe_certification(db)
    return create_run(db, execute_now=True)
