from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TestRunConfig
from app.schemas import (
    ConnectorBehaviorView,
    ScenarioActionView,
    ScenarioExecuteResult,
    ScenarioIn,
    ScenarioView,
)
from app.services import scenarios

router = APIRouter(prefix="/api/v1/scenarios", tags=["scenarios"])


def _view(config: TestRunConfig) -> ScenarioView:
    return ScenarioView(
        id=config.id,
        name=config.name,
        run_mode=config.run_mode.value,
        environment=config.environment.value,
        zone_name=config.zone_name,
        store_ids=config.store_ids,
        canary_store_ids=config.canary_store_ids,
        is_seeded=config.is_seeded,
        created_at=config.created_at,
        actions=[
            ScenarioActionView(
                id=a.id, product_name=a.product_name, sku=a.sku, previous_price=a.previous_price,
                approved_price=a.approved_price, reason=a.reason, is_kvi=a.is_kvi, deadline_at=a.deadline_at,
            )
            for a in config.actions
        ],
        behaviors=[
            ConnectorBehaviorView(
                id=b.id, store_id=b.store_id, sku=b.sku, channel_type=b.channel_type.value,
                behavior_type=b.behavior_type.value, configured_observed_price=b.configured_observed_price,
                configured_delay_ms=b.configured_delay_ms, retry_success_price=b.retry_success_price,
            )
            for b in config.behaviors
        ],
    )


def _get_or_404(db: Session, config_id: str) -> TestRunConfig:
    config = scenarios.get_config(db, config_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return config


@router.post("", response_model=ScenarioView, status_code=201)
def create_scenario(payload: ScenarioIn, db: Session = Depends(get_db)):
    return _view(scenarios.create_config(db, payload))


@router.get("", response_model=list[ScenarioView])
def list_scenarios(db: Session = Depends(get_db)):
    # Ensure the seeded showcase scenario always exists.
    scenarios.ensure_memorial_day(db)
    return [_view(c) for c in scenarios.list_configs(db)]


@router.get("/{config_id}", response_model=ScenarioView)
def get_scenario(config_id: str, db: Session = Depends(get_db)):
    return _view(_get_or_404(db, config_id))


@router.post("/{config_id}/execute", response_model=ScenarioExecuteResult)
def execute_scenario(config_id: str, mode: str | None = None, db: Session = Depends(get_db)):
    config = _get_or_404(db, config_id)
    run_mode = mode or config.run_mode.value
    return scenarios.execute(db, config, run_mode)


@router.post("/{config_id}/reset", response_model=ScenarioExecuteResult)
def reset_scenario(config_id: str, mode: str | None = None, db: Session = Depends(get_db)):
    config = _get_or_404(db, config_id)
    run_mode = mode or config.run_mode.value
    return scenarios.execute(db, config, run_mode)


@router.post("/{config_id}/clone", response_model=ScenarioView)
def clone_scenario(config_id: str, db: Session = Depends(get_db)):
    config = _get_or_404(db, config_id)
    return _view(scenarios.clone_config(db, config))
