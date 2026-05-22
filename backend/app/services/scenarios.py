"""Connector Scenario configuration + execution.

A scenario is the *configuration* (products, prices, stores, and per-channel
connector behaviors). Executing it builds a real batch and runs it through the
shared engine. The Memorial Day demo is just one saved, seeded scenario — its
failures live in connector_behavior_profiles, not in code.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ids import new_id
from app.models import (
    BehaviorType,
    Channel,
    ConnectorBehaviorProfile,
    Environment,
    PriceBatch,
    RunMode,
    TestRunAction,
    TestRunConfig,
)
from app.schemas import ApprovedActionIn, PriceBatchIn, ScenarioIn
from app.seed import DEMO_EXTERNAL_ID, wipe_batch
from app.services import orchestrator
from app.services.ingestion import ingest_batch

MEMORIAL_DAY_NAME = "Memorial Day Dallas Zone 2"


def _markdown_deadline() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=18, minute=0, second=0, microsecond=0)


# ---------------------------------------------------------------------------
# Seeded showcase scenario (configuration-driven, not hardcoded)
# ---------------------------------------------------------------------------
def get_memorial_day(db: Session) -> TestRunConfig | None:
    return db.scalar(select(TestRunConfig).where(TestRunConfig.name == MEMORIAL_DAY_NAME))


def create_memorial_day(db: Session) -> TestRunConfig:
    cfg = TestRunConfig(
        id=new_id("cfg"),
        name=MEMORIAL_DAY_NAME,
        run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION,
        zone_name="Dallas Zone 2",
        store_ids_csv="214,302,317,401",
        canary_store_ids_csv="214,302",
        is_seeded=True,
    )
    db.add(cfg)
    db.flush()

    db.add_all([
        TestRunAction(id=new_id("tra"), test_run_config_id=cfg.id, product_name="Cage-Free Large Brown Eggs, 12 Count",
                      sku="egg-cage-free-brown-12", previous_price=4.49, approved_price=4.19,
                      reason="Competitive response", is_kvi=True),
        TestRunAction(id=new_id("tra"), test_run_config_id=cfg.id, product_name="Fresh Strawberries, 1 lb",
                      sku="strawberry-1lb", previous_price=3.99, approved_price=2.99,
                      reason="Perishable markdown", deadline_at=_markdown_deadline()),
        TestRunAction(id=new_id("tra"), test_run_config_id=cfg.id,
                      product_name="Premium Not-From-Concentrate Orange Juice, 52 oz",
                      sku="oj-nfc-premium-52oz", previous_price=9.99, approved_price=9.49,
                      reason="Supplier cost change"),
    ])

    # Only the FAILING connectors need a profile; everything else defaults to success.
    db.add_all([
        ConnectorBehaviorProfile(
            id=new_id("beh"), test_run_config_id=cfg.id, store_id="214", sku="egg-cage-free-brown-12",
            channel_type=Channel.POS, behavior_type=BehaviorType.STALE_PRICE,
            configured_observed_price=4.49, retry_success_price=4.19,
        ),
        ConnectorBehaviorProfile(
            id=new_id("beh"), test_run_config_id=cfg.id, store_id="214", sku="strawberry-1lb",
            channel_type=Channel.ESL, behavior_type=BehaviorType.TIMEOUT_THEN_SUCCESS,
        ),
    ])
    db.commit()
    db.refresh(cfg)
    return cfg


def ensure_memorial_day(db: Session) -> TestRunConfig:
    return get_memorial_day(db) or create_memorial_day(db)


# ---------------------------------------------------------------------------
# Build a batch payload from a configuration
# ---------------------------------------------------------------------------
def build_payload(config: TestRunConfig, run_mode: str, external_id: str, idempotency_key: str) -> PriceBatchIn:
    canary = config.canary_store_ids
    others = [s for s in config.store_ids if s not in canary]
    ordered_stores = canary + others  # canary first so ingestion picks them
    actions = [
        ApprovedActionIn(
            sku=a.sku,
            product_name=a.product_name,
            approved_price=a.approved_price,
            prior_price=a.previous_price,
            reason=a.reason,
            is_kvi=a.is_kvi,
            is_perishable=a.deadline_at is not None,
            markdown_deadline=a.deadline_at,
        )
        for a in config.actions
    ]
    return PriceBatchIn(
        external_id=external_id,
        idempotency_key=idempotency_key,
        name=config.name,
        zone=config.zone_name,
        total_store_count=len(ordered_stores),
        store_ids=ordered_stores,
        actions=actions,
        run_mode=run_mode,
        environment=config.environment.value,
        scenario_config_id=config.id,
        canary_store_count=len(canary) or 1,
    )


def _live_external_id(config: TestRunConfig) -> str:
    return DEMO_EXTERNAL_ID if config.name == MEMORIAL_DAY_NAME else f"live-{config.id}"


def execute_live(db: Session, config: TestRunConfig) -> PriceBatch:
    """Run a scenario as a live rollout through the shared engine."""
    external_id = _live_external_id(config)
    wipe_batch(db, external_id)
    payload = build_payload(config, "live_rollout", external_id, f"idem-{external_id}")
    result = ingest_batch(db, payload)
    orchestrator.drain(db)
    db.refresh(result.batch)
    return result.batch


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------
def create_config(db: Session, payload: ScenarioIn) -> TestRunConfig:
    cfg = TestRunConfig(
        id=new_id("cfg"),
        name=payload.name,
        run_mode=RunMode(payload.run_mode),
        environment=Environment(payload.environment),
        zone_name=payload.zone_name,
        store_ids_csv=",".join(payload.store_ids),
        canary_store_ids_csv=",".join(payload.canary_store_ids),
        is_seeded=False,
    )
    db.add(cfg)
    db.flush()
    for a in payload.actions:
        db.add(TestRunAction(
            id=new_id("tra"), test_run_config_id=cfg.id, product_name=a.product_name, sku=a.sku,
            previous_price=a.previous_price, approved_price=a.approved_price, reason=a.reason,
            is_kvi=a.is_kvi, deadline_at=a.deadline_at,
        ))
    for b in payload.behaviors:
        db.add(ConnectorBehaviorProfile(
            id=new_id("beh"), test_run_config_id=cfg.id, store_id=b.store_id, sku=b.sku,
            channel_type=Channel(b.channel_type), behavior_type=BehaviorType(b.behavior_type),
            configured_observed_price=b.configured_observed_price,
            configured_delay_ms=b.configured_delay_ms, retry_success_price=b.retry_success_price,
        ))
    db.commit()
    db.refresh(cfg)
    return cfg


def execute(db: Session, config: TestRunConfig, mode: str) -> dict:
    """Execute a scenario in the requested mode through the shared engine."""
    if mode == "certification":
        from app.services import certification

        run = certification.run_for_config(db, config)
        return {
            "mode": "certification", "redirect": "/certification",
            "scenario_id": config.id, "run_id": run.id, "batch_external_id": None,
        }
    batch = execute_live(db, config)
    return {
        "mode": "live_rollout", "redirect": "/operations",
        "scenario_id": config.id, "batch_external_id": batch.external_id, "run_id": None,
    }


def list_configs(db: Session) -> list[TestRunConfig]:
    return list(db.scalars(select(TestRunConfig).order_by(TestRunConfig.created_at.desc())))


def get_config(db: Session, config_id: str) -> TestRunConfig | None:
    return db.get(TestRunConfig, config_id)


def clone_config(db: Session, config: TestRunConfig, new_name: str | None = None) -> TestRunConfig:
    clone = TestRunConfig(
        id=new_id("cfg"),
        name=new_name or f"{config.name} (copy)",
        run_mode=config.run_mode,
        environment=config.environment,
        zone_name=config.zone_name,
        store_ids_csv=config.store_ids_csv,
        canary_store_ids_csv=config.canary_store_ids_csv,
        is_seeded=False,
    )
    db.add(clone)
    db.flush()
    for a in config.actions:
        db.add(TestRunAction(
            id=new_id("tra"), test_run_config_id=clone.id, product_name=a.product_name, sku=a.sku,
            previous_price=a.previous_price, approved_price=a.approved_price, reason=a.reason,
            is_kvi=a.is_kvi, deadline_at=a.deadline_at,
        ))
    for b in config.behaviors:
        db.add(ConnectorBehaviorProfile(
            id=new_id("beh"), test_run_config_id=clone.id, store_id=b.store_id, sku=b.sku,
            channel_type=b.channel_type, behavior_type=b.behavior_type,
            configured_observed_price=b.configured_observed_price,
            configured_delay_ms=b.configured_delay_ms, retry_success_price=b.retry_success_price,
        ))
    db.commit()
    db.refresh(clone)
    return clone
