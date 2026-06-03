"""State-hygiene + data-round-trip regressions from the deep backend audit.

  • effective_at / promotional_price were silently dropped from the scenario READ
    view and from clone_config — a client round-tripping (or cloning) a scenario
    lost the promo price and the scheduled go-live, so a register legitimately
    ringing the promo price would later be flagged as a mismatch.
  • rollback_incident never recomputed batch status/block_reason (every other
    recovery action does), leaving a stale reason on the batch.
  • blast-radius velocity summed units across ALL stores for a single-store
    incident, overstating the dollars-at-risk.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import (
    BatchStatus,
    Channel,
    Environment,
    HistoricalSale,
    Incident,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
    RunMode,
    utcnow,
)
from app.routers.scenarios import _view
from app.schemas import ConnectorBehaviorIn, ScenarioActionIn, ScenarioIn
from app.services import blast_radius, recovery, scenarios


def test_scenario_view_and_clone_preserve_promo_and_effective_at(db):
    """effective_at and promotional_price must survive the scenario read view AND a
    clone — both previously dropped them. (Audit P1.)"""
    eff = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)
    payload = ScenarioIn(
        name="Promo Ad",
        run_mode="live_rollout",
        zone_name="Z",
        store_ids=["s1"],
        canary_store_ids=["s1"],
        actions=[
            ScenarioActionIn(
                product_name="Cola 12pk",
                sku="cola-roundtrip",
                previous_price=6.99,
                approved_price=4.99,
                promotional_price=3.99,
                effective_at=eff,
            )
        ],
        behaviors=[],
    )
    cfg = scenarios.create_config(db, payload)

    view = _view(cfg)
    assert view.actions[0].promotional_price == 3.99
    assert view.actions[0].effective_at is not None
    # tz-robust compare (SQLite returns naive, Postgres tz-aware).
    assert view.actions[0].effective_at.replace(tzinfo=None) == eff.replace(tzinfo=None)

    clone = scenarios.clone_config(db, cfg)
    cview = _view(clone)
    assert cview.actions[0].promotional_price == 3.99
    assert cview.actions[0].effective_at is not None
    assert cview.actions[0].effective_at.replace(tzinfo=None) == eff.replace(tzinfo=None)


def test_rollback_recomputes_batch_block_reason(db):
    """rollback_incident must recompute batch status/block_reason like every other
    recovery action, rather than leaving a stale value behind. (Audit P1.)"""
    payload = ScenarioIn(
        name="Rollback Refresh",
        run_mode="live_rollout",
        zone_name="Z",
        store_ids=["s1"],
        canary_store_ids=["s1"],
        actions=[
            ScenarioActionIn(
                product_name="Milk", sku="milk-rb-refresh", previous_price=6.49, approved_price=5.99
            )
        ],
        behaviors=[
            ConnectorBehaviorIn(
                store_id="s1",
                sku="milk-rb-refresh",
                channel_type="pos",
                behavior_type="stale_price",
                configured_observed_price=6.49,
            )
        ],
    )
    cfg = scenarios.create_config(db, payload)
    batch = scenarios.execute_live(db, cfg)
    inc = (
        db.query(Incident)
        .filter(Incident.batch_id == batch.id, Incident.type == IncidentType.PRICE_MISMATCH)
        .one()
    )

    # Scribble a stale reason; only a refresh during rollback should overwrite it.
    batch.block_reason = "STALE — should be recomputed by rollback"
    db.commit()

    recovery.rollback_incident(db, inc.id, actor="reviewer")
    db.refresh(batch)
    assert batch.block_reason != "STALE — should be recomputed by rollback"
    # The action stays blocked after a rollback, so the batch is still held — but the
    # reason now reflects the real recomputed state, not the stale string.
    assert batch.status == BatchStatus.BLOCKED


def test_blast_radius_velocity_is_per_store(db):
    """A single-store incident's velocity must count only that store's sales, not
    every store's volume for the SKU — otherwise dollars-at-risk is inflated.
    (Audit P2.)"""
    batch = PriceBatch(
        id="b_br_store",
        external_id="br-store",
        idempotency_key="idem-br-store",
        name="BR Store",
        zone="Z",
        run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION,
        total_store_count=2,
    )
    db.add(batch)
    db.flush()
    action = PriceAction(
        id="a_br_store",
        batch_id=batch.id,
        sku="milk",
        product_name="Milk",
        store_id="s1",
        approved_price=5.99,
        prior_price=6.49,
        reason="t",
    )
    db.add(action)
    db.flush()
    base = utcnow()
    for d in range(5):
        db.add(
            HistoricalSale(
                id=f"sale_s1_{d}", sku="milk", store_id="s1",
                date=base - timedelta(days=d), price=5.99, units_sold=100,
            )
        )
        db.add(
            HistoricalSale(
                id=f"sale_s2_{d}", sku="milk", store_id="s2",
                date=base - timedelta(days=d), price=5.99, units_sold=50,
            )
        )
    inc = Incident(
        id="inc_br_store",
        batch_id=batch.id,
        action_id=action.id,
        type=IncidentType.PRICE_MISMATCH,
        severity=IncidentSeverity.CRITICAL,
        status=IncidentStatus.OPEN,
        summary="m",
        offending_channel=Channel.POS,
    )
    db.add(inc)
    db.commit()

    br = blast_radius.for_incident(db, inc, observed_price=6.49)
    # Only store s1's 100 units/day — NOT s1 + s2 = 150.
    assert br.daily_units == 100.0
    assert br.daily_dollars_at_risk == round(0.50 * 100, 2)  # 50.0, not 75.0
