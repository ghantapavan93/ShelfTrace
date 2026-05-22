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
