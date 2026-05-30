"""PostgreSQL-backed tests for the Organic Whole Milk hero scenario.

Verifies that ensure_milk_hero() seeds exactly one idempotent config, that the
canary batch surfaces the expected POS price mismatch ($6.49 stale vs $5.99
approved), that ESL and ecommerce verify cleanly, that measurement eligibility
is quarantined, and that the seeded batch does not pollute the live-mode scope.
"""
import pytest

from app.models import (
    BatchStatus,
    Channel,
    ChannelDelivery,
    Incident,
    IncidentType,
    PriceBatch,
    PriceAction,
    ReceiptStatus,
    RunMode,
    TestRunConfig,
)
from app.services import scenarios
from app.services.measurement import MeasurementEligibility, derive_eligibility_for_action
from app.services.scenarios import MILK_HERO_NAME


# ---------------------------------------------------------------------------
# 1. Idempotency
# ---------------------------------------------------------------------------
def test_milk_hero_seeding_is_idempotent(db):
    """Calling ensure_milk_hero() twice must not create duplicate configs or batches."""
    scenarios.ensure_milk_hero(db)
    scenarios.ensure_milk_hero(db)

    configs = (
        db.query(TestRunConfig)
        .filter(
            TestRunConfig.is_seeded.is_(True),
            TestRunConfig.name.contains("Organic Whole Milk"),
        )
        .all()
    )
    assert len(configs) == 1, (
        f"Expected exactly 1 seeded Organic Whole Milk config, found {len(configs)}"
    )

    batches = (
        db.query(PriceBatch)
        .filter(PriceBatch.scenario_config_id == configs[0].id)
        .all()
    )
    assert len(batches) == 1, (
        f"Expected exactly 1 batch for the milk hero scenario, found {len(batches)}"
    )


# ---------------------------------------------------------------------------
# 2. POS mismatch creates a CRITICAL incident
# ---------------------------------------------------------------------------
def test_milk_hero_pos_mismatch_creates_critical_incident(db):
    """The canary execution must detect the stale POS price and raise a
    PRICE_MISMATCH incident. The POS receipt must record the stale price ($6.49)
    against the approved price ($5.99)."""
    cfg = scenarios.ensure_milk_hero(db)
    batch = db.query(PriceBatch).filter(PriceBatch.scenario_config_id == cfg.id).one()

    incidents = (
        db.query(Incident)
        .filter(
            Incident.batch_id == batch.id,
            Incident.type == IncidentType.PRICE_MISMATCH,
        )
        .all()
    )
    assert len(incidents) >= 1, "Expected at least one PRICE_MISMATCH incident"

    # The batch itself must be blocked by the mismatch.
    assert batch.status == BatchStatus.BLOCKED

    # Find the canary action for store 214 (the only canary store for milk hero).
    canary_action = next(
        (a for a in batch.actions if a.sku == "milk-organic-whole-1gal" and a.store_id == "214"),
        None,
    )
    assert canary_action is not None, "Canary action for store 214 / milk SKU not found"

    pos_delivery = (
        db.query(ChannelDelivery)
        .filter(
            ChannelDelivery.action_id == canary_action.id,
            ChannelDelivery.channel == Channel.POS,
        )
        .one_or_none()
    )
    assert pos_delivery is not None, "POS ChannelDelivery not found for canary action"
    assert pos_delivery.receipt is not None, "POS delivery has no receipt"
    assert pos_delivery.receipt.status == ReceiptStatus.MISMATCH

    # Stale price the connector was configured to return.
    assert pos_delivery.receipt.observed_price == pytest.approx(6.49, abs=0.01)
    # Approved price the system expected.
    assert pos_delivery.receipt.expected_price == pytest.approx(5.99, abs=0.01)
    assert pos_delivery.receipt.observed_price != pos_delivery.receipt.expected_price


# ---------------------------------------------------------------------------
# 3. ESL and ecommerce verify cleanly
# ---------------------------------------------------------------------------
def test_milk_hero_esl_and_ecommerce_verified(db):
    """ESL and ecommerce channels must carry VERIFIED receipts at $5.99;
    only the POS receipt should be a MISMATCH."""
    cfg = scenarios.ensure_milk_hero(db)
    batch = db.query(PriceBatch).filter(PriceBatch.scenario_config_id == cfg.id).one()

    canary_action = next(
        (a for a in batch.actions if a.sku == "milk-organic-whole-1gal" and a.store_id == "214"),
        None,
    )
    assert canary_action is not None

    deliveries = (
        db.query(ChannelDelivery)
        .filter(ChannelDelivery.action_id == canary_action.id)
        .all()
    )
    by_channel = {d.channel: d for d in deliveries}

    # ESL must be verified at approved price.
    esl = by_channel.get(Channel.ESL)
    assert esl is not None, "ESL delivery not found"
    assert esl.receipt is not None, "ESL delivery has no receipt"
    assert esl.receipt.status == ReceiptStatus.VERIFIED
    assert esl.receipt.observed_price == pytest.approx(5.99, abs=0.01)

    # Ecommerce must be verified at approved price.
    ecom = by_channel.get(Channel.ECOMMERCE)
    assert ecom is not None, "Ecommerce delivery not found"
    assert ecom.receipt is not None, "Ecommerce delivery has no receipt"
    assert ecom.receipt.status == ReceiptStatus.VERIFIED
    assert ecom.receipt.observed_price == pytest.approx(5.99, abs=0.01)

    # POS must be the only mismatch.
    pos = by_channel.get(Channel.POS)
    assert pos is not None, "POS delivery not found"
    assert pos.receipt.status == ReceiptStatus.MISMATCH


# ---------------------------------------------------------------------------
# 4. Measurement eligibility is quarantined (INELIGIBLE due to POS mismatch)
# ---------------------------------------------------------------------------
def test_milk_hero_measurement_quarantined(db):
    """The POS mismatch must cause the measurement eligibility check to return
    INELIGIBLE_EXECUTION_NOT_VERIFIED with a POS_PRICE_MISMATCH reason."""
    cfg = scenarios.ensure_milk_hero(db)
    batch = db.query(PriceBatch).filter(PriceBatch.scenario_config_id == cfg.id).one()

    canary_action = next(
        (a for a in batch.actions if a.sku == "milk-organic-whole-1gal" and a.store_id == "214"),
        None,
    )
    assert canary_action is not None

    result = derive_eligibility_for_action(db, canary_action)

    assert result.status == MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED
    assert result.reason == "POS_PRICE_MISMATCH"
    assert result.blocked_channel == "pos"


# ---------------------------------------------------------------------------
# 5. Demo-mode seeding does not pollute live-mode scope
# ---------------------------------------------------------------------------
def test_milk_hero_live_mode_isolation(db):
    """The milk hero seeded batch carries a demo: source_run_id and must not
    appear when filtering for user-scope (live-mode) batches only."""
    cfg = scenarios.ensure_milk_hero(db)
    batch = db.query(PriceBatch).filter(PriceBatch.scenario_config_id == cfg.id).one()

    # The batch's source_run_id must be the demo scope tag, not a user: prefix.
    assert batch.source_run_id == "demo:milk-hero", (
        f"Expected source_run_id='demo:milk-hero', got '{batch.source_run_id}'"
    )

    # A live-mode filter (source_run_id LIKE 'user:%') must not return this batch.
    live_batches = (
        db.query(PriceBatch)
        .filter(PriceBatch.source_run_id.like("user:%"))
        .all()
    )
    live_ids = {b.id for b in live_batches}
    assert batch.id not in live_ids, (
        "Milk hero seeded batch must not appear under the live-mode user: scope filter"
    )


# ---------------------------------------------------------------------------
# 6. Reset restores milk as the primary live-rollout target
# ---------------------------------------------------------------------------
def test_reset_restores_milk_as_primary_target(db):
    """The demo reset must restore Memorial Day AND re-run the milk hero last,
    so the milk POS-mismatch batch is the reset target and the freshest
    live-rollout batch (what /operations defaults to) — not Memorial Day."""
    from app.seed import seed_live
    from app.services.scenarios import MILK_HERO_EXTERNAL_ID

    # Replicate the /api/v1/demo/reset service sequence exactly.
    seed_live(db)
    milk_config = scenarios.ensure_milk_hero(db)
    milk_batch = scenarios.execute_live(db, milk_config)

    # The reset target is the milk hero batch, in its blocked POS-mismatch state.
    assert milk_batch.external_id == MILK_HERO_EXTERNAL_ID
    assert milk_batch.status == BatchStatus.BLOCKED
    assert milk_batch.scenario_config_id == milk_config.id

    # It must be the freshest live-rollout batch — the one operations defaults to.
    newest_live = (
        db.query(PriceBatch)
        .filter(PriceBatch.run_mode == RunMode.LIVE_ROLLOUT)
        .order_by(PriceBatch.created_at.desc())
        .first()
    )
    assert newest_live is not None
    assert newest_live.id == milk_batch.id, (
        "Milk hero must be the newest live-rollout batch after reset"
    )


