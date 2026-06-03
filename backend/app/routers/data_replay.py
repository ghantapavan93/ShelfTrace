from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SourceDatasetType, SourceObservation
from app.schemas import (
    CreateScenarioFromObservationIn,
    ScenarioExecuteResult,
    SourceDatasetView,
    SourceObservationView,
)
from app.security import Identity, require_operator
from app.services import data_replay, scenarios

router = APIRouter(prefix="/api/v1", tags=["data-replay"])


def _dataset_view(ds) -> SourceDatasetView:
    return SourceDatasetView(
        id=ds.id,
        source_type=ds.source_type.value,
        source_name=ds.source_name,
        attribution_text=ds.attribution_text,
        source_url=ds.source_url,
        license_or_usage_note=ds.license_or_usage_note,
        imported_at=ds.imported_at,
    )


def _observation_view(db: Session, obs: SourceObservation) -> SourceObservationView:
    return SourceObservationView(
        id=obs.id,
        source_dataset_id=obs.source_dataset_id,
        source=_dataset_view(obs.dataset),
        external_record_id=obs.external_record_id,
        observation_type=obs.observation_type.value,
        product_name=obs.product_name,
        category=obs.category,
        brand=obs.brand,
        gtin_upc=obs.gtin_upc,
        region=obs.region,
        observation_date=obs.observation_date,
        observed_price=obs.observed_price,
        normalized=json.loads(obs.normalized_payload_json),
        raw_payload=json.loads(obs.raw_payload_json),
        imported_at=obs.imported_at,
    )


@router.get("/data-sources", response_model=list[SourceDatasetView])
def list_data_sources(db: Session = Depends(get_db)):
    return [_dataset_view(ds) for ds in data_replay.list_datasets(db)]


@router.post("/data-sources/import/usda-fdc", response_model=SourceObservationView, status_code=201)
def import_usda_fdc(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    obs = data_replay.import_source(db, SourceDatasetType.USDA_FDC)
    return _observation_view(db, obs)


@router.post("/data-sources/import/usda-ams", response_model=SourceObservationView, status_code=201)
def import_usda_ams(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    obs = data_replay.import_source(db, SourceDatasetType.USDA_AMS)
    return _observation_view(db, obs)


@router.get("/source-observations", response_model=list[SourceObservationView])
def list_observations(db: Session = Depends(get_db)):
    return [_observation_view(db, o) for o in data_replay.list_observations(db)]


@router.get("/source-observations/{obs_id}", response_model=SourceObservationView)
def get_observation(obs_id: str, db: Session = Depends(get_db)):
    obs = data_replay.get_observation(db, obs_id)
    if obs is None:
        raise HTTPException(status_code=404, detail="Source observation not found")
    return _observation_view(db, obs)


@router.post("/source-observations/{obs_id}/create-scenario", response_model=ScenarioExecuteResult)
def create_scenario_from_observation(
    obs_id: str,
    payload: CreateScenarioFromObservationIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    obs = data_replay.get_observation(db, obs_id)
    if obs is None:
        raise HTTPException(status_code=404, detail="Source observation not found")
    try:
        config = data_replay.create_scenario_from_observation(db, obs, payload)
    except scenarios.ScenarioValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    # Execute through the shared engine and return the redirect target.
    return scenarios.execute(db, config, payload.mode)
