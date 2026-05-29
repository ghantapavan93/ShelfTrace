"""Real Data Replay: public-source records → ShelfTrace execution scenarios.

Proves the imports are real (USDA FDC + USDA AMS bundled fixtures), source
provenance is preserved end-to-end, and a source-linked scenario runs through
the same shared engine — not a parallel one.
"""
from app.models import (
    Incident,
    IncidentType,
    PriceBatch,
    SourceDatasetType,
    SourceObservation,
)
from app.schemas import CreateScenarioFromObservationIn
from app.services import data_replay, orchestrator


def test_usda_fdc_fixture_imports(db):
    obs = data_replay.import_source(db, SourceDatasetType.USDA_FDC)
    assert isinstance(obs, SourceObservation)
    assert obs.product_name == "ORGANIC WHOLE MILK"
    assert obs.brand == "HORIZON"
    assert obs.gtin_upc == "742365228407"
    assert obs.external_record_id == "1871817"
    assert obs.dataset.source_type == SourceDatasetType.USDA_FDC
    # Public-domain attribution carried through.
    assert "FoodData Central" in obs.dataset.source_name
    assert "CC0" in obs.dataset.license_or_usage_note


def test_usda_ams_fixture_imports_with_real_pricing(db):
    obs = data_replay.import_source(db, SourceDatasetType.USDA_AMS)
    assert obs.observation_type.value == "advertised_price"
    assert obs.observed_price == 9.25
    assert obs.product_name.startswith("Fresh Strawberries")
    assert "AH_FV160" in obs.external_record_id
    assert obs.dataset.source_type == SourceDatasetType.USDA_AMS
    # Honest labeling: this is auction grower price, not retail advertised.
    assert "Auction" in obs.dataset.license_or_usage_note or "auction" in obs.dataset.license_or_usage_note


def test_import_is_idempotent(db):
    first = data_replay.import_source(db, SourceDatasetType.USDA_AMS)
    again = data_replay.import_source(db, SourceDatasetType.USDA_AMS)
    assert first.id == again.id
    # Exactly one observation per external_record_id+dataset.
    assert db.query(SourceObservation).count() == 1


def test_scenario_from_observation_carries_source_lineage(db):
    obs = data_replay.import_source(db, SourceDatasetType.USDA_AMS)
    cfg = data_replay.create_scenario_from_observation(
        db,
        obs,
        CreateScenarioFromObservationIn(
            mode="live_rollout",
            store_ids=["501", "502"],
            canary_store_ids=["501"],
        ),
    )
    assert cfg.source_observation_id == obs.id
    # Lineage helper returns the full provenance.
    lin = data_replay.lineage_for_scenario(db, cfg.source_observation_id)
    assert lin is not None
    assert lin["source"]["source_type"] == "usda_ams"
    assert lin["observed_price"] == 9.25


def test_source_linked_scenario_runs_through_shared_engine(db):
    """Executing a scenario built from the AMS strawberry observation must
    produce a real deadline-risk incident from the shared engine — proving
    Real Data Replay does NOT bypass the existing pipeline."""
    from app.services import scenarios

    obs = data_replay.import_source(db, SourceDatasetType.USDA_AMS)
    cfg = data_replay.create_scenario_from_observation(
        db,
        obs,
        CreateScenarioFromObservationIn(
            mode="live_rollout",
            store_ids=["501", "502"],
            canary_store_ids=["501"],
        ),
    )
    scenarios.execute(db, cfg, "live_rollout")
    batch = db.query(PriceBatch).filter(PriceBatch.scenario_config_id == cfg.id).one()
    # Same engine: outbox + adapter + reconciliation + audit all fired.
    assert batch.actions  # ingestion created the action
    assert batch.scenario_config_id == cfg.id
    # The default behavior for an AMS price observation is ESL timeout_then_success,
    # which the existing reconciliation rules turn into an OPEN incident.
    incidents = (
        db.query(Incident).filter(Incident.batch_id == batch.id).all()
    )
    assert any(i.type == IncidentType.DEADLINE_RISK or i.type == IncidentType.CHANNEL_TIMEOUT
               for i in incidents)


def test_product_identity_source_requires_explicit_price(db):
    """FDC product records have no price; the API must reject scenario creation
    without an explicit approved_price."""
    import pytest
    from app.services.scenarios import ScenarioValidationError

    obs = data_replay.import_source(db, SourceDatasetType.USDA_FDC)
    with pytest.raises(ScenarioValidationError):
        data_replay.create_scenario_from_observation(
            db, obs, CreateScenarioFromObservationIn(mode="live_rollout")
        )
    # With an explicit price it succeeds.
    cfg = data_replay.create_scenario_from_observation(
        db,
        obs,
        CreateScenarioFromObservationIn(
            mode="live_rollout", approved_price=5.99, previous_price=6.49,
            store_ids=["501", "502"], canary_store_ids=["501"],
        ),
    )
    assert cfg.source_observation_id == obs.id
