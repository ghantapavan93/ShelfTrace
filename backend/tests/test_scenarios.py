"""The configurable engine: scenarios drive behavior, not hardcoded product logic."""
from datetime import datetime, timezone

from app.models import (
    ActionDecision,
    BatchStatus,
    ChannelDelivery,
    ConnectorBehaviorProfile,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
    ReceiptStatus,
    TestRunConfig,
)
import pytest

from app.schemas import ConnectorBehaviorIn, ScenarioActionIn, ScenarioIn
from app.services import recovery, scenarios


def _milk_scenario(behaviors):
    return ScenarioIn(
        name="Milk Promo Test",
        run_mode="live_rollout",
        zone_name="Test Zone",
        store_ids=["s1", "s2"],
        canary_store_ids=["s1", "s2"],
        actions=[
            ScenarioActionIn(
                product_name="Whole Milk, 1 Gallon", sku="milk-1gal",
                previous_price=3.49, approved_price=2.99, reason="Promotional price",
            )
        ],
        behaviors=behaviors,
    )


def test_custom_scenario_creates_mismatch_incident(db):
    """A different product with a configured stale POS price produces the same
    critical mismatch — proving the engine is not egg-specific."""
    cfg = scenarios.create_config(db, _milk_scenario([
        ConnectorBehaviorIn(store_id="s1", sku="milk-1gal", channel_type="pos",
                            behavior_type="stale_price", configured_observed_price=3.49,
                            retry_success_price=2.99),
    ]))
    batch = scenarios.execute_live(db, cfg)

    inc = db.query(Incident).filter(Incident.batch_id == batch.id, Incident.type == IncidentType.PRICE_MISMATCH).all()
    assert len(inc) == 1
    action = db.get(PriceAction, inc[0].action_id)
    assert action.sku == "milk-1gal" and action.store_id == "s1"
    assert batch.status == BatchStatus.BLOCKED


def test_success_only_scenario_completes_without_incidents(db):
    cfg = scenarios.create_config(db, _milk_scenario([]))  # no failing behaviors
    batch = scenarios.execute_live(db, cfg)
    assert db.query(Incident).filter(Incident.batch_id == batch.id).count() == 0
    # All canary actions verified -> ready to expand.
    assert batch.status == BatchStatus.READY_FOR_EXPANSION
    assert batch.expansion_blocked is False


def test_timeout_then_success_resolves_after_retry(db):
    cfg = scenarios.create_config(db, _milk_scenario([
        ConnectorBehaviorIn(store_id="s1", sku="milk-1gal", channel_type="esl",
                            behavior_type="timeout_then_success"),
    ]))
    batch = scenarios.execute_live(db, cfg)
    inc = db.query(Incident).filter(Incident.batch_id == batch.id).one()
    assert inc.status == IncidentStatus.OPEN  # timed out, awaiting retry

    recovery.retry_incident(db, inc.id)
    db.refresh(inc)
    action = db.get(PriceAction, inc.action_id)
    assert inc.status == IncidentStatus.RESOLVED
    assert action.decision == ActionDecision.ELIGIBLE


def test_duplicate_ack_does_not_duplicate_delivery(db):
    cfg = scenarios.create_config(db, _milk_scenario([
        ConnectorBehaviorIn(store_id="s1", sku="milk-1gal", channel_type="pos",
                            behavior_type="duplicate_ack"),
    ]))
    batch = scenarios.execute_live(db, cfg)
    action = next(a for a in batch.actions if a.store_id == "s1")
    pos_deliveries = (
        db.query(ChannelDelivery)
        .filter(ChannelDelivery.action_id == action.id, ChannelDelivery.channel == "pos")
        .count()
    )
    # Duplicate acknowledgement must not create a second delivery; price still verifies.
    assert pos_deliveries == 1
    assert db.query(Incident).filter(Incident.batch_id == batch.id).count() == 0


def test_memorial_day_is_loaded_from_configuration(db):
    """The showcase demo is configuration-driven: its failures live in
    connector_behavior_profiles, not in code."""
    cfg = scenarios.ensure_memorial_day(db)
    assert isinstance(cfg, TestRunConfig)
    behaviors = db.query(ConnectorBehaviorProfile).filter(
        ConnectorBehaviorProfile.test_run_config_id == cfg.id
    ).all()
    # Exactly the two scripted failures: egg POS stale + strawberry ESL timeout-then-success.
    kinds = {(b.sku, b.channel_type.value, b.behavior_type.value) for b in behaviors}
    assert ("egg-cage-free-brown-12", "pos", "stale_price") in kinds
    assert ("strawberry-1lb", "esl", "timeout_then_success") in kinds

    batch = scenarios.execute_live(db, cfg)
    assert batch.scenario_config_id == cfg.id
    assert batch.status == BatchStatus.BLOCKED


def test_validation_rejects_canary_not_subset(db):
    bad = ScenarioIn(
        name="Bad", run_mode="live_rollout", zone_name="Z",
        store_ids=["s1"], canary_store_ids=["s9"],  # s9 not in stores
        actions=[ScenarioActionIn(product_name="X", sku="x", previous_price=1.0, approved_price=1.0)],
    )
    with pytest.raises(scenarios.ScenarioValidationError):
        scenarios.create_config(db, bad)


def test_validation_rejects_behavior_for_unknown_sku(db):
    bad = _milk_scenario([
        ConnectorBehaviorIn(store_id="s1", sku="not-a-real-sku", channel_type="pos", behavior_type="timeout"),
    ])
    with pytest.raises(scenarios.ScenarioValidationError):
        scenarios.create_config(db, bad)


def test_delete_scenario_removes_config_and_orphan_batch(db):
    cfg = scenarios.create_config(db, _milk_scenario([]))
    batch = scenarios.execute_live(db, cfg)
    ext = batch.external_id

    scenarios.delete_config(db, cfg)

    assert scenarios.get_config(db, cfg.id) is None
    from app.models import PriceBatch
    assert db.query(PriceBatch).filter(PriceBatch.external_id == ext).count() == 0


def test_seeded_scenario_cannot_be_deleted(db):
    cfg = scenarios.ensure_memorial_day(db)
    with pytest.raises(scenarios.ScenarioValidationError):
        scenarios.delete_config(db, cfg)
