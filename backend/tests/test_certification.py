import json

from app.models import (
    BatchStatus,
    CertificationRunStatus,
    ChannelDelivery,
    CheckStatus,
    CheckType,
    OutboxEvent,
    PriceAction,
    PriceBatch,
    RunMode,
)
from app.seed import demo_payload
from app.services import certification, orchestrator
from app.services.ingestion import ingest_batch


def _checks_by_type(run):
    return {c.check_type: c for c in run.checks}


def test_certification_uses_shared_pipeline(db):
    """A certification run must flow through the same ingestion + outbox + delivery
    pipeline as live rollout — proven by real outbox events and channel deliveries."""
    run = certification.reset_demo(db)
    batch = db.get(PriceBatch, run.batch_id)

    assert batch is not None
    assert batch.run_mode == RunMode.CERTIFICATION
    assert batch.environment.value == "sandbox"

    # Same transactional outbox the live pipeline uses.
    outbox = db.query(OutboxEvent).filter(OutboxEvent.aggregate_id.in_([a.id for a in batch.actions])).count()
    assert outbox > 0
    # Same typed channel adapters / deliveries.
    action_ids = [a.id for a in batch.actions]
    deliveries = (
        db.query(ChannelDelivery).filter(ChannelDelivery.action_id.in_(action_ids)).count()
    )
    assert deliveries > 0


def test_certification_records_egg_pos_failure(db):
    run = certification.reset_demo(db)
    check = _checks_by_type(run)[CheckType.PRICE_AGREEMENT]
    assert check.status == CheckStatus.FAILED

    # evidence_json is JSONB on Postgres / JSON on SQLite — SQLAlchemy returns
    # a native dict either way, so no manual deserialization is needed.
    evidence = check.evidence_json
    assert evidence["observed_price"] == 4.49
    assert evidence["approved_price"] == 4.19


def test_certification_records_strawberry_recovered(db):
    run = certification.reset_demo(db)
    check = _checks_by_type(run)[CheckType.MARKDOWN_SLA]
    assert check.status == CheckStatus.RECOVERED


def test_certification_records_orange_juice_pass(db):
    run = certification.reset_demo(db)
    check = _checks_by_type(run)[CheckType.ECOMMERCE_VERIFICATION]
    assert check.status == CheckStatus.PASSED


def test_certification_overall_fails_while_pos_failed(db):
    run = certification.reset_demo(db)
    assert run.status == CertificationRunStatus.FAILED_PENDING_REMEDIATION
    assert "POS connector" in (run.final_recommendation or "")
    # Idempotency, recovery-safety and canary-protection checks all pass.
    by_type = _checks_by_type(run)
    assert by_type[CheckType.IDEMPOTENT_BATCH].status == CheckStatus.PASSED
    assert by_type[CheckType.RECOVERY_SAFETY].status == CheckStatus.PASSED
    assert by_type[CheckType.CANARY_PROTECTION].status == CheckStatus.PASSED


def test_rerun_failed_checks_can_pass(db):
    run = certification.reset_demo(db)
    assert run.status == CertificationRunStatus.FAILED_PENDING_REMEDIATION
    certification.rerun_failed_checks(db, run)
    db.refresh(run)
    # Retrying the POS connector heals it -> overall passes.
    assert run.status == CertificationRunStatus.PASSED
    assert _checks_by_type(run)[CheckType.PRICE_AGREEMENT].status == CheckStatus.PASSED


def test_live_rollout_behaviour_unchanged(db):
    """The live Memorial Day demo keeps behaving exactly as before — now driven by
    the scenario configuration rather than hardcoded logic."""
    from tests._helpers import seed_live_demo

    batch = seed_live_demo(db)
    assert batch.run_mode == RunMode.LIVE_ROLLOUT
    assert batch.scenario_config_id is not None  # config-driven, not hardcoded
    assert batch.status == BatchStatus.BLOCKED
    assert batch.expansion_blocked is True
