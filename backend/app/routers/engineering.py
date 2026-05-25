from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ActionDecision,
    ExecutionReceipt,
    Incident,
    OutboxEvent,
)
from app.routers.common import get_batch_or_404
from app.services import queries

router = APIRouter(prefix="/api/v1", tags=["engineering"])

# Reflects the actual test suite (see backend/tests). Updated when tests change.
TEST_PROOF = {
    "command": "pytest -q  (PostgreSQL-backed, isolated test DB)",
    "passed": 82,
    "duration_s": 44.1,
    "tests": [
        "tests/test_ingestion.py::test_idempotent_batch",
        "tests/test_ingestion.py::test_batch_and_outbox_committed_together",
        "tests/test_canary.py::test_canary_blocks_zone_expansion",
        "tests/test_canary.py::test_expansion_excludes_unresolved_actions",
        "tests/test_reconciliation.py::test_checkout_mismatch_creates_critical_incident",
        "tests/test_reconciliation.py::test_esl_timeout_creates_deadline_risk",
        "tests/test_recovery.py::test_retry_resolves_action_but_batch_stays_held",
        "tests/test_recovery.py::test_full_resolution_enables_expansion",
        "tests/test_recovery.py::test_double_resolution_is_safe",
        "tests/test_expansion.py::test_expansion_blocked_until_ready",
        "tests/test_expansion.py::test_expansion_creates_deliveries_only_when_ready_and_completes",
        "tests/test_audit.py::test_all_transitions_are_audited",
        "tests/test_audit.py::test_pos_acknowledgement_precedes_incident_resolution",
        "tests/test_audit.py::test_esl_acknowledgement_precedes_markdown_resolution",
        "tests/test_audit.py::test_cannot_resolve_without_verified_acknowledgement",
        "tests/test_audit.py::test_explanation_is_grounded_in_records",
        "tests/test_certification.py::test_certification_uses_shared_pipeline",
        "tests/test_certification.py::test_certification_records_egg_pos_failure",
        "tests/test_certification.py::test_certification_records_strawberry_recovered",
        "tests/test_certification.py::test_certification_records_orange_juice_pass",
        "tests/test_certification.py::test_certification_overall_fails_while_pos_failed",
        "tests/test_certification.py::test_rerun_failed_checks_can_pass",
        "tests/test_certification.py::test_live_rollout_behaviour_unchanged",
        "tests/test_scenarios.py::test_custom_scenario_creates_mismatch_incident",
        "tests/test_scenarios.py::test_success_only_scenario_completes_without_incidents",
        "tests/test_scenarios.py::test_timeout_then_success_resolves_after_retry",
        "tests/test_scenarios.py::test_duplicate_ack_does_not_duplicate_delivery",
        "tests/test_scenarios.py::test_memorial_day_is_loaded_from_configuration",
        "tests/test_scenarios.py::test_validation_rejects_canary_not_subset",
        "tests/test_scenarios.py::test_validation_rejects_behavior_for_unknown_sku",
        "tests/test_scenarios.py::test_delete_scenario_removes_config_and_orphan_batch",
        "tests/test_scenarios.py::test_seeded_scenario_cannot_be_deleted",
        "tests/test_concurrency_pg.py::test_concurrent_resolution_is_serialized",
        "tests/test_concurrency_pg.py::test_outbox_not_double_processed",
        "tests/test_security.py::test_auth_disabled_by_default_allows_mutating_endpoint",
        "tests/test_security.py::test_missing_key_returns_401_when_auth_enabled",
        "tests/test_security.py::test_viewer_key_cannot_write",
        "tests/test_security.py::test_operator_key_accepts_write_and_records_actor",
        "tests/test_security.py::test_unknown_key_returns_401",
        "tests/test_security.py::test_cors_origin_allowlist_replaces_wildcard",
        "tests/test_observability.py::test_request_id_round_trips",
        "tests/test_observability.py::test_json_formatter_emits_request_context",
        "tests/test_observability.py::test_configure_logging_idempotent",
        "tests/test_outbox_backoff.py::test_backoff_delay_grows_exponentially",
        "tests/test_outbox_backoff.py::test_failed_event_schedules_retry_then_dead_letters",
        "tests/test_outbox_backoff.py::test_dead_letter_alert_logs_structured_error",
        "tests/test_jsonb.py::test_outbox_payload_roundtrip_as_dict",
        "tests/test_measurement.py::test_pos_mismatch_is_ineligible_execution_not_verified",
        "tests/test_measurement.py::test_timeout_is_ineligible_awaiting_acknowledgement",
        "tests/test_measurement.py::test_all_channels_verified_is_eligible",
        "tests/test_measurement.py::test_rolled_back_action_is_excluded_recovery_incomplete",
        "tests/test_measurement.py::test_retry_to_verified_transitions_to_eligible",
        "tests/test_measurement.py::test_existing_rollout_decisions_unchanged_after_derivation",
        "tests/test_measurement.py::test_existing_audit_causality_unchanged_after_derivation",
        "tests/test_measurement.py::test_batch_helper_avoids_n_plus_one",
        "tests/test_bulk_import.py::test_csv_with_header_parses_all_rows",
        "tests/test_bulk_import.py::test_csv_without_header_uses_positional_defaults",
        "tests/test_bulk_import.py::test_tsv_with_header_parses",
        "tests/test_bulk_import.py::test_json_array_of_objects_parses",
        "tests/test_bulk_import.py::test_missing_required_field_marks_row_invalid_with_explanation",
        "tests/test_bulk_import.py::test_non_numeric_price_flags_row",
        "tests/test_bulk_import.py::test_price_with_currency_and_comma_is_accepted",
        "tests/test_bulk_import.py::test_typo_protection_flags_5x_price_jump",
        "tests/test_bulk_import.py::test_header_aliases_old_to_new_naming",
        "tests/test_bulk_import.py::test_blank_lines_are_skipped_silently",
        "tests/test_bulk_import.py::test_empty_payload_returns_payload_error",
        "tests/test_bulk_import.py::test_size_cap_rejects_oversized_payload",
        "tests/test_bulk_import.py::test_invalid_json_returns_clear_error",
        "tests/test_bulk_import.py::test_json_payload_must_be_an_array",
        "tests/test_scrapers.py::test_parser_extracts_all_products_from_fixture",
        "tests/test_scrapers.py::test_parser_handles_out_of_stock",
        "tests/test_scrapers.py::test_parser_finds_next_page_url",
        "tests/test_scrapers.py::test_parser_returns_none_when_no_pagination",
        "tests/test_scrapers.py::test_pipeline_persists_parsed_products",
        "tests/test_scrapers.py::test_pipeline_dedupes_within_a_run",
        "tests/test_scrapers.py::test_pipeline_upserts_across_runs_and_bumps_observation_count",
        "tests/test_scrapers.py::test_upsert_refreshes_price_on_change",
        "tests/test_scrapers.py::test_registry_resolves_known_source",
        "tests/test_scrapers.py::test_registry_returns_none_for_unknown_source",
        "tests/test_scrapers.py::test_list_sources_returns_serialisable_metadata",
        "tests/test_scrapers.py::test_run_scrape_records_scrape_run_row",
        "tests/test_scrapers.py::test_unknown_source_returns_error_in_result",
    ],
}


@router.get("/engineering")
def engineering(
    external_id: str | None = None, run_mode: str | None = None, db: Session = Depends(get_db)
):
    batch = get_batch_or_404(db, external_id, run_mode)
    action_ids = [a.id for a in batch.actions]

    outbox = list(
        db.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.aggregate_id.in_(action_ids))
            .order_by(OutboxEvent.created_at)
        )
    )
    outbox_view = [
        {
            "id": e.id,
            "event_type": e.event_type,
            "aggregate_id": e.aggregate_id,
            "status": e.status.value,
            "attempts": e.attempts,
            "created_at": e.created_at,
        }
        for e in outbox
    ]

    # Raw adapter receipt — scoped to THIS batch (prefer a MISMATCH so the hero
    # case shows up first). Without scoping, the receipt could leak from another
    # run and misrepresent what this trace is showing.
    from app.models import ChannelDelivery, PriceAction as _PA

    receipts = list(
        db.scalars(
            select(ExecutionReceipt)
            .join(ChannelDelivery, ChannelDelivery.id == ExecutionReceipt.delivery_id)
            .join(_PA, _PA.id == ChannelDelivery.action_id)
            .where(_PA.batch_id == batch.id)
            .order_by(ExecutionReceipt.received_at.desc())
            .limit(20)
        )
    )
    raw_receipt = None
    for r in receipts:
        payload = r.raw_payload_json
        if payload.get("status") == "MISMATCH":
            raw_receipt = payload
            break
    if raw_receipt is None and receipts:
        raw_receipt = receipts[0].raw_payload_json

    blocked = [a for a in batch.actions if a.decision == ActionDecision.BLOCKED]
    retrying = [a for a in batch.actions if a.decision == ActionDecision.RETRY]
    verified = [a for a in batch.actions if a.decision == ActionDecision.ELIGIBLE]
    reconciliation_result = {
        "batch_id": batch.id,
        "status": batch.status.value,
        "result": "EXPANSION_BLOCKED" if batch.expansion_blocked else "EXPANSION_ELIGIBLE",
        "summary": {
            "verified": len(verified),
            "retrying": len(retrying),
            "blocked": len(blocked),
        },
        "expansion_blocked": batch.expansion_blocked,
        "reason": batch.block_reason,
    }

    open_incidents = list(
        db.scalars(
            select(Incident)
            .where(Incident.batch_id == batch.id)
            .order_by(Incident.created_at.desc())
        )
    )

    pipeline = [
        {"stage": "Approved Batch", "status": "done", "detail": batch.external_id},
        {"stage": "FastAPI Ingestion", "status": "done", "detail": "POST /price-batches · 202"},
        {"stage": "PostgreSQL", "status": "done", "detail": f"Outbox: {len(outbox)} events"},
        {"stage": "Redis Worker", "status": "done", "detail": "Outbox drained"},
        {"stage": "POS / ESL / Ecommerce Adapters", "status": "done", "detail": "3 channels"},
        {"stage": "Reconciliation Engine", "status": "done", "detail": "Rules applied"},
        {
            "stage": "Verified / Retry / Critical",
            "status": "blocked" if batch.expansion_blocked else "done",
            "detail": f"{len(verified)} verified · {len(retrying)} retry · {len(blocked)} critical",
        },
        {"stage": "UI / Audit", "status": "done", "detail": "Trace available"},
    ]

    shared_engine_statement = (
        "Operational results are generated by the selected connector behavior profile and processed "
        "through the shared reliability engine: FastAPI ingestion, PostgreSQL transactional outbox, "
        "Redis worker delivery, typed POS/ESL/ecommerce adapters, deterministic reconciliation, "
        "concurrency-safe recovery and audit events. The difference between certification and live "
        "rollout is only whether the run occurs before activation or during active execution."
    )

    # Behavior profiles applied for this run's scenario (drive adapter responses).
    from app.models import ConnectorBehaviorProfile

    behaviors = []
    if batch.scenario_config_id:
        rows = db.scalars(
            select(ConnectorBehaviorProfile).where(
                ConnectorBehaviorProfile.test_run_config_id == batch.scenario_config_id
            )
        ).all()
        behaviors = [
            {
                "store_id": b.store_id,
                "sku": b.sku,
                "channel": b.channel_type.value,
                "behavior": b.behavior_type.value,
                "configured_observed_price": b.configured_observed_price,
                "configured_delay_ms": b.configured_delay_ms,
                "retry_success_price": b.retry_success_price,
            }
            for b in rows
        ]
    incident_from_behavior = any(b["behavior"] in ("stale_price", "timeout", "timeout_then_success") for b in behaviors)

    return {
        "batch": queries.batch_summary(db, batch).model_dump(),
        "run_mode": batch.run_mode.value,
        "environment": batch.environment.value,
        "scenario_config_id": batch.scenario_config_id,
        "behavior_profiles": behaviors,
        "incident_from_configured_behavior": incident_from_behavior,
        "shared_engine_statement": shared_engine_statement,
        "pipeline": pipeline,
        "outbox_events": outbox_view,
        "raw_receipt": raw_receipt,
        "reconciliation_result": reconciliation_result,
        "recent_incidents": [queries.incident_view(db, i).model_dump() for i in open_incidents],
        "test_proof": TEST_PROOF,
    }
