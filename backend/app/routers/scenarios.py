from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TestRunConfig
from app.schemas import (
    BulkImportPreviewResponse,
    BulkImportRequest,
    BulkImportRowView,
    ConnectorBehaviorView,
    ScenarioActionView,
    ScenarioExecuteResult,
    ScenarioIn,
    ScenarioView,
)
from app.security import Identity, require_operator
from app.services import bulk_import, scenario_enrichment, scenarios

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
def create_scenario(
    payload: ScenarioIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    try:
        return _view(scenarios.create_config(db, payload))
    except scenarios.ScenarioValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("", response_model=list[ScenarioView])
def list_scenarios(db: Session = Depends(get_db)):
    # Ensure the seeded showcase scenario always exists.
    scenarios.ensure_memorial_day(db)
    return [_view(c) for c in scenarios.list_configs(db)]


@router.get("/{config_id}", response_model=ScenarioView)
def get_scenario(config_id: str, db: Session = Depends(get_db)):
    return _view(_get_or_404(db, config_id))


@router.post("/{config_id}/execute", response_model=ScenarioExecuteResult)
def execute_scenario(
    config_id: str,
    mode: str | None = None,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    config = _get_or_404(db, config_id)
    run_mode = mode or config.run_mode.value
    return scenarios.execute(db, config, run_mode)


@router.post("/{config_id}/reset", response_model=ScenarioExecuteResult)
def reset_scenario(
    config_id: str,
    mode: str | None = None,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    config = _get_or_404(db, config_id)
    run_mode = mode or config.run_mode.value
    return scenarios.execute(db, config, run_mode)


@router.post("/{config_id}/clone", response_model=ScenarioView)
def clone_scenario(
    config_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    config = _get_or_404(db, config_id)
    return _view(scenarios.clone_config(db, config))


@router.delete("/{config_id}", status_code=204)
def delete_scenario(
    config_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    config = _get_or_404(db, config_id)
    try:
        scenarios.delete_config(db, config)
    except scenarios.ScenarioValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/auto-enrich", status_code=201)
def auto_enrich_scenario(
    body: dict,
    db: Session = Depends(get_db),
):
    """One-shot enrichment for a fresh scenario.

    Takes the founder's just-applied actions + stores and:
      1. Bootstraps the knowledge graph (entity + SKU link + competitor obs)
      2. Seeds product costs (default 62% of approved_price)
      3. Seeds 30 days of synthetic sales history per SKU × store
      4. Runs the pricing engine across everything

    After this call returns, the 🌐 Competitor and 🧠 Pricing hint pills
    on the scenario page populate without the founder navigating away.

    Body: {
      actions: [{sku, product_name, approved_price}, ...],
      store_ids: ["Store-A", ...] (optional but recommended),
      zone_id: "Texas North" (optional)
    }
    """
    actions = body.get("actions") or []
    store_ids = body.get("store_ids") or []
    zone_id = body.get("zone_id") or None

    if not isinstance(actions, list) or not actions:
        raise HTTPException(status_code=422, detail="actions list is required")

    result = scenario_enrichment.auto_enrich_for_actions(
        db=db,
        actions=actions,
        store_ids=store_ids if isinstance(store_ids, list) else [],
        zone_id=zone_id,
    )
    return result


@router.post("/import/preview", response_model=BulkImportPreviewResponse)
def import_preview(payload: BulkImportRequest):
    """Server-side parse + validate of a CSV/TSV/JSON product payload.

    Stateless — no DB write. Frontend calls this when the user clicks
    "Validate on server" to get authoritative per-row validation that
    matches the production write-path's expectations.
    """
    fmt = payload.format.lower()
    if fmt not in ("csv", "tsv", "json"):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported format '{payload.format}'. Use csv, tsv, or json.",
        )
    result = bulk_import.preview(fmt, payload.content)  # type: ignore[arg-type]
    return BulkImportPreviewResponse(
        format=result.format,
        summary=result.summary,
        payload_errors=result.payload_errors,
        blank_rows_skipped=result.blank_rows_skipped,
        rows=[
            BulkImportRowView(
                row_number=r.row_number,
                valid=r.valid,
                errors=r.errors,
                sku=r.sku,
                product_name=r.product_name,
                previous_price=r.previous_price,
                approved_price=r.approved_price,
                reason=r.reason,
                is_kvi=r.is_kvi,
                deadline_at=r.deadline_at,
            )
            for r in result.rows
        ],
    )
