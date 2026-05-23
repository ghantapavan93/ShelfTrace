"""Real Data Replay.

Imports public-domain grocery records (USDA FoodData Central Branded Foods,
USDA AMS Specialty Crops Market News) from bundled fixtures, preserves their
source attribution, and turns them into ShelfTrace execution scenarios that
run through the exact same shared reliability engine.

ShelfTrace does not decide the optimal price. Real public data is used to
create realistic, traceable execution-replay inputs. Store connectors stay
simulated.
"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ids import new_id
from app.models import (
    ObservationType,
    SourceDataset,
    SourceDatasetType,
    SourceObservation,
)
from app.schemas import (
    ConnectorBehaviorIn,
    CreateScenarioFromObservationIn,
    ScenarioActionIn,
    ScenarioIn,
)
from app.services import scenarios

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "data_fixtures"
FIXTURE_MAP = {
    SourceDatasetType.USDA_FDC: "usda_fdc_milk_1871817.json",
    SourceDatasetType.USDA_AMS: "usda_ams_strawberries_AH_FV160.json",
}


def load_fixture(source_type: SourceDatasetType) -> dict:
    name = FIXTURE_MAP[source_type]
    with open(FIXTURE_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_or_create_dataset(db: Session, payload: dict) -> SourceDataset:
    stype = SourceDatasetType(payload["source_type"])
    existing = db.scalar(
        select(SourceDataset).where(
            SourceDataset.source_type == stype,
            SourceDataset.source_name == payload["source_name"],
        )
    )
    if existing is not None:
        return existing
    ds = SourceDataset(
        id=new_id("src"),
        source_type=stype,
        source_name=payload["source_name"],
        attribution_text=payload["attribution_text"],
        source_url=payload["source_url"],
        license_or_usage_note=payload["license_or_usage_note"],
    )
    db.add(ds)
    db.flush()
    return ds


def _get_or_create_observation(db: Session, ds: SourceDataset, payload: dict) -> SourceObservation:
    ext_id = str(payload["external_record_id"])
    existing = db.scalar(
        select(SourceObservation).where(
            SourceObservation.source_dataset_id == ds.id,
            SourceObservation.external_record_id == ext_id,
        )
    )
    if existing is not None:
        return existing  # importing the same record again is a no-op (idempotent)
    n = payload["normalized"]
    obs = SourceObservation(
        id=new_id("obs"),
        source_dataset_id=ds.id,
        external_record_id=ext_id,
        observation_type=ObservationType(payload["observation_type"]),
        product_name=n.get("product_name") or "",
        category=n.get("category"),
        brand=n.get("brand"),
        gtin_upc=n.get("gtin_upc"),
        region=n.get("region"),
        observation_date=n.get("observation_date"),
        observed_price=n.get("price_average") or n.get("observed_price"),
        raw_payload_json=json.dumps(payload.get("raw_payload", {})),
        normalized_payload_json=json.dumps(n),
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)
    return obs


def import_source(db: Session, source_type: SourceDatasetType) -> SourceObservation:
    """Import the bundled fixture for the given source type. Idempotent."""
    payload = load_fixture(source_type)
    ds = _get_or_create_dataset(db, payload)
    return _get_or_create_observation(db, ds, payload)


def list_datasets(db: Session) -> list[SourceDataset]:
    return list(db.scalars(select(SourceDataset).order_by(SourceDataset.imported_at)))


def list_observations(db: Session) -> list[SourceObservation]:
    return list(db.scalars(select(SourceObservation).order_by(SourceObservation.imported_at.desc())))


def get_observation(db: Session, obs_id: str) -> SourceObservation | None:
    return db.get(SourceObservation, obs_id)


# ---------------------------------------------------------------------------
# Build a scenario from a real observation (carries source lineage forward)
# ---------------------------------------------------------------------------
def _sku_from(obs: SourceObservation) -> str:
    n = json.loads(obs.normalized_payload_json)
    return n.get("sku_hint") or (obs.gtin_upc or f"obs-{obs.id}")


def _default_behaviors_for(obs: SourceObservation, canary_store: str, sku: str) -> list[ConnectorBehaviorIn]:
    """Sensible default for the showcase per source: AMS strawberry markdown gets
    an ESL timeout_then_success (matches the existing demo story); FDC product
    identity gets no default failure (caller can configure)."""
    if obs.source_dataset_id and obs.observation_type == ObservationType.ADVERTISED_PRICE:
        return [
            ConnectorBehaviorIn(
                store_id=canary_store, sku=sku, channel_type="esl",
                behavior_type="timeout_then_success",
            )
        ]
    return []


def create_scenario_from_observation(
    db: Session, obs: SourceObservation, payload: CreateScenarioFromObservationIn
) -> "scenarios.TestRunConfig":
    n = json.loads(obs.normalized_payload_json)
    sku = _sku_from(obs)
    approved = payload.approved_price if payload.approved_price is not None else (obs.observed_price or 0.0)
    if approved <= 0:
        # Product-identity sources (FDC) don't carry prices; require an explicit price.
        from app.services.scenarios import ScenarioValidationError

        raise ScenarioValidationError(
            "This source has no price observation; provide approved_price in the request body."
        )
    previous = payload.previous_price if payload.previous_price is not None else round(approved * 1.10, 2)

    store_ids = payload.store_ids or ["501", "502"]
    canary = payload.canary_store_ids or [store_ids[0]]
    behaviors = payload.behaviors or _default_behaviors_for(obs, canary[0], sku)

    scenario_payload = ScenarioIn(
        name=payload.name or f"{obs.product_name} · {(obs.brand or 'real-data').lower()} replay",
        run_mode=payload.mode,
        environment="sandbox" if payload.mode == "certification" else "simulated_production",
        zone_name=payload.zone_name or (obs.region or "Real-Data Replay Zone"),
        store_ids=store_ids,
        canary_store_ids=canary,
        actions=[
            ScenarioActionIn(
                product_name=obs.product_name,
                sku=sku,
                previous_price=previous,
                approved_price=approved,
                reason=payload.reason or "Real-data replay (public-source observation)",
                is_kvi=False,
                deadline_at=None,
            )
        ],
        behaviors=behaviors,
    )
    config = scenarios.create_config(db, scenario_payload)
    config.source_observation_id = obs.id
    db.commit()
    db.refresh(config)
    return config


def lineage_for_scenario(db: Session, source_observation_id: str | None) -> dict | None:
    """Return a compact source-lineage view for a scenario's engineering trace."""
    if not source_observation_id:
        return None
    obs = db.get(SourceObservation, source_observation_id)
    if obs is None:
        return None
    ds = db.get(SourceDataset, obs.source_dataset_id)
    return {
        "observation_id": obs.id,
        "external_record_id": obs.external_record_id,
        "product_name": obs.product_name,
        "observation_type": obs.observation_type.value,
        "observed_price": obs.observed_price,
        "observation_date": obs.observation_date,
        "region": obs.region,
        "brand": obs.brand,
        "gtin_upc": obs.gtin_upc,
        "source": {
            "id": ds.id if ds else None,
            "source_type": ds.source_type.value if ds else None,
            "source_name": ds.source_name if ds else None,
            "attribution_text": ds.attribution_text if ds else None,
            "source_url": ds.source_url if ds else None,
            "license_or_usage_note": ds.license_or_usage_note if ds else None,
        },
    }
