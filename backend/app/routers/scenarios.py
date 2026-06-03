from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.scope import Scope, current_scope

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
from app.scenarios import realistic_scale
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
        import_source_hash=config.import_source_hash,
        import_source_name=config.import_source_name,
        import_summary=config.import_summary_json,
        created_by=config.created_by,
        created_at=config.created_at,
        actions=[
            ScenarioActionView(
                id=a.id, product_name=a.product_name, sku=a.sku, previous_price=a.previous_price,
                approved_price=a.approved_price, reason=a.reason, is_kvi=a.is_kvi, deadline_at=a.deadline_at,
                effective_at=a.effective_at, promotional_price=a.promotional_price,
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
        return _view(scenarios.create_config(db, payload, actor=identity.actor))
    except scenarios.ScenarioValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("", response_model=list[ScenarioView])
def list_scenarios(
    scope: str | None = Query(
        None,
        description="Data scope: 'live' (user-built scenarios only), 'demo' (seeded only), 'all'. "
        "TestRunConfig.is_seeded is the demo marker — Live mode hides seeded configs.",
    ),
    db: Session = Depends(get_db),
):
    """List saved scenarios honoring the Live/Demo data-scope contract.

    TestRunConfig has its own demo marker (`is_seeded`) since it predates
    source_run_id. Mapping is straightforward:
      Scope.LIVE → is_seeded = False
      Scope.DEMO → is_seeded = True
      Scope.ALL  → no filter
    """
    # Ensure the seeded showcase scenario always exists.
    scenarios.ensure_memorial_day(db)
    resolved = current_scope(scope)
    all_configs = scenarios.list_configs(db)
    if resolved == Scope.LIVE:
        configs = [c for c in all_configs if not c.is_seeded]
    elif resolved == Scope.DEMO:
        configs = [c for c in all_configs if c.is_seeded]
    else:
        configs = all_configs
    return [_view(c) for c in configs]


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
    identity: Identity = Depends(require_operator),
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
    # Optional explicit scope. Use `is not None` (not `or`) so an explicit
    # empty string isn't silently swapped for the service default.
    source_run_id = body.get("source_run_id")
    if source_run_id is not None and not str(source_run_id).strip():
        source_run_id = None

    if not isinstance(actions, list) or not actions:
        raise HTTPException(status_code=422, detail="actions list is required")

    result = scenario_enrichment.auto_enrich_for_actions(
        db=db,
        actions=actions,
        store_ids=store_ids if isinstance(store_ids, list) else [],
        zone_id=zone_id,
        source_run_id=source_run_id,
    )
    return result


@router.post("/load-realistic-scale", status_code=201)
def load_realistic_scale(
    reload: bool = False,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    """Load the production-shape "Realistic Scale" preset.

    Populates the product graph, cost catalog, competitor observations,
    and 60 days of sales history for ~150 SKUs across 8 grocery
    categories with realistic per-category elasticities. Lets every
    working-platform surface (knowledge graph, pricing engine, KVI
    watchlist, margin target buckets, substitutes, tier ladder,
    operations) demonstrate at production data volumes.

    Idempotent — subsequent calls no-op unless `reload=true`. Returns
    rich summary stats the UI uses for the "just loaded" toast.
    """
    return realistic_scale.load_realistic_scale(db, reload=reload)


@router.post("/import/preview/stream")
def import_preview_stream(
    payload: BulkImportRequest,
    identity: Identity = Depends(require_operator),
):
    """Stream per-row validation results as Server-Sent Events.

    Identical contract to /import/preview except the delivery shape is
    progressive: the server emits one SSE event per row as it's parsed,
    plus a 'meta' opener and 'done' closer. The frontend can render rows
    as they arrive instead of waiting for the full preview to assemble.

    Why SSE over WebSocket: this is one-way server → client, request /
    response shaped (single POST, single stream back), and SSE works
    through every HTTP proxy + CDN without sticky sessions or upgrade
    headers. No reason to reach for WebSocket complexity here.

    Why POST (not GET): the CSV payload can be up to 1 MiB; URLs aren't
    the right place. Standard EventSource() doesn't support POST, so the
    frontend uses fetch() + response.body.getReader() instead — same
    SSE wire format, just consumed with a streaming reader.

    Event protocol (text/event-stream framing):
        event: meta\\ndata: {format, source_sha256, schema_version}\\n\\n
        event: row\\ndata: {row_number, valid, errors, sku, ...}\\n\\n   (0..n)
        event: error\\ndata: {message}\\n\\n                              (0..n)
        event: done\\ndata: {total, valid, invalid, blank_rows_skipped}\\n\\n
    """
    fmt = payload.format.lower()
    if fmt not in ("csv", "tsv", "json"):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported format '{payload.format}'. Use csv, tsv, or json.",
        )

    def event_stream():
        for kind, data in bulk_import.stream_preview(fmt, payload.content):  # type: ignore[arg-type]
            # Each event is one logical SSE frame: "event: <name>\n
            # data: <json>\n\n". Newlines inside the JSON payload are
            # escaped by json.dumps so they don't terminate the frame.
            yield f"event: {kind}\ndata: {json.dumps(data)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            # Disable nginx + Cloudflare response buffering so events
            # reach the client in real time, not in a single batch when
            # the generator completes.
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/import/preview", response_model=BulkImportPreviewResponse)
def import_preview(
    payload: BulkImportRequest,
    identity: Identity = Depends(require_operator),
):
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
        source_sha256=result.source_sha256,
        schema_version=result.schema_version,
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
