from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Inbound contract: an already-approved price batch from an upstream pricing system
# ---------------------------------------------------------------------------
class ApprovedActionIn(BaseModel):
    sku: str
    product_name: str
    approved_price: float
    prior_price: float
    reason: str
    is_kvi: bool = False
    is_perishable: bool = False
    markdown_deadline: datetime | None = None
    projected_impact: str | None = None


class PriceBatchIn(BaseModel):
    external_id: str = Field(..., description="Upstream batch identifier")
    idempotency_key: str = Field(..., description="Dedup key; same key = same workflow")
    name: str
    zone: str
    approved_by: str = "upstream-pricing-system"
    total_store_count: int = 4
    store_ids: list[str] = Field(..., description="All target stores; first N become the canary")
    actions: list[ApprovedActionIn]
    # Run mode: live batches default to live_rollout; certification runs pass certification.
    run_mode: str = "live_rollout"
    environment: str = "simulated_production"
    connector_profile_id: str | None = None
    scenario_config_id: str | None = None
    canary_store_count: int | None = None  # defaults to settings.canary_store_count


# ---------------------------------------------------------------------------
# Outbound read models
# ---------------------------------------------------------------------------
class ChannelView(BaseModel):
    channel: str
    status: str
    expected_price: float
    observed_price: float | None
    attempts: int


class MeasurementEligibilityView(BaseModel):
    """Read-only derived view of whether an action's execution is verified well
    enough to be attributed by a downstream performance-measurement layer.

    Distinct from ``ActionView.decision`` (which gates rollout expansion).
    See :mod:`app.services.measurement` for the derivation rules and
    precedence."""

    status: str  # one of the MeasurementEligibility enum values
    reason: str  # short machine code, e.g. POS_PRICE_MISMATCH / ALL_REQUIRED_CHANNELS_VERIFIED
    required_channels: list[str]
    verified_channels: list[str]
    blocked_channel: str | None = None
    summary: str  # one-line plain English


class ActionView(BaseModel):
    id: str
    sku: str
    product_name: str
    store_id: str
    approved_price: float
    prior_price: float
    reason: str
    is_kvi: bool
    is_perishable: bool
    markdown_deadline: datetime | None
    projected_impact: str | None
    decision: str
    channels: list[ChannelView]
    # Forward-compatible: clients that don't know about this field ignore it.
    measurement_eligibility: MeasurementEligibilityView | None = None


class BatchLifecycleView(BaseModel):
    """Batch-level rollup of the post-export execution journey.

    Competitor pricing tools treat a batch as *done* at ``Exported``. The real
    journey continues for days after export: each price must publish to its
    channels, get verified per channel, and only then become eligible for
    downstream performance measurement. This view surfaces how far past
    ``Exported`` a whole batch actually got, derived entirely from the same
    per-action predicates the Decision Receipt uses — it never introduces a
    second source of truth for published / verified / measured.

    Stages are monotonically nested: ``measured <= verified <= published <=
    exported == total`` (an action can't be measured without being verified,
    nor verified without being published)."""

    exported: int  # every action accepted into the control plane (== total)
    published: int  # actions dispatched to their channels via the outbox
    verified: int  # actions whose required channels all reconciled to the approved price
    measured: int  # actions eligible for downstream performance measurement
    total: int  # total actions in the batch (alias of exported, for ratio math)
    summary: str  # deterministic one-line rollup assembled from the counts


class BatchSummary(BaseModel):
    id: str
    external_id: str
    name: str
    zone: str
    status: str
    approved_by: str
    total_store_count: int
    canary_store_ids: list[str]
    expansion_store_ids: list[str]
    expansion_blocked: bool
    block_reason: str | None
    created_at: datetime
    total_actions: int
    canary_action_count: int
    verified_actions: int
    blocked_actions: int
    retry_actions: int
    critical_incidents: int
    deadline_risks: int
    # Optional post-export lifecycle rollup. Forward-compatible: clients that
    # don't request/know it simply omit it (default None keeps existing
    # serialization + tests unchanged).
    lifecycle: BatchLifecycleView | None = None


class BatchDetail(BatchSummary):
    actions: list[ActionView]


class IncidentView(BaseModel):
    id: str
    batch_id: str
    batch_external_id: str
    zone: str
    action_id: str
    type: str
    severity: str
    status: str
    summary: str
    offending_channel: str | None
    product_name: str
    sku: str
    store_id: str
    approved_price: float
    observed_price: float | None
    created_at: datetime
    resolved_at: datetime | None
    channels: list[ChannelView]
    # Forward-compatible.
    measurement_eligibility: MeasurementEligibilityView | None = None


class IncidentExplanation(BaseModel):
    incident_id: str
    what_happened: str
    why_it_matters: str
    recommended_next_actions: list[str]
    channels: list[ChannelView]


class AuditEventView(BaseModel):
    id: str
    event: str
    detail: str
    actor: str
    created_at: datetime


class OutboxEventView(BaseModel):
    id: str
    event_type: str
    aggregate_id: str
    status: str
    attempts: int
    next_attempt_at: datetime | None
    created_at: datetime


class OperationsOverview(BaseModel):
    batch: BatchSummary
    critical_incident: IncidentView | None
    deadline_risk: IncidentView | None
    eligible_action: ActionView | None
    recent_activity: list[AuditEventView]
    rollout_progress: dict


class StoreTaskView(BaseModel):
    id: str
    incident_id: str
    store_id: str
    instruction: str
    status: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Decision Receipt — a derived, read-only evidence chain for one price action.
#
# It threads the state the validated core already maintains (upstream signal →
# product match → batch approval → connector certification → channel dispatch →
# reconciliation → measurement eligibility → recovery) into ONE causal record.
# No new tables, no new write paths, no new audit events: every value is read
# from existing rows. See :mod:`app.services.receipt`.
# ---------------------------------------------------------------------------
class ReceiptEvidenceItem(BaseModel):
    """One labelled fact backing a stage. ``tone`` is a display hint only
    (verified | danger | warn | violet | muted | None)."""

    label: str
    value: str
    tone: str | None = None


class ReceiptStageView(BaseModel):
    """A single node on the evidence rail.

    ``state`` is one of: ``verified`` (chain intact here), ``active`` (in
    progress), ``pending`` (waiting on evidence), ``failed`` (the verified
    chain broke here), ``excluded`` (deliberately removed from measurement),
    ``not_applicable`` (a neutral/optional stage that doesn't apply)."""

    key: str
    label: str
    state: str
    headline: str
    detail: str
    evidence: list[ReceiptEvidenceItem] = []
    at: datetime | None = None


class IncidentRefView(BaseModel):
    """Compact incident reference embedded in a receipt (the full incident has
    its own endpoint)."""

    id: str
    type: str
    severity: str
    status: str
    summary: str
    offending_channel: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class DecisionReceiptView(BaseModel):
    action_id: str
    sku: str
    product_name: str
    store_id: str
    zone: str
    batch_id: str
    batch_external_id: str
    approved_price: float
    prior_price: float
    reason: str
    is_kvi: bool
    is_perishable: bool
    decision: str
    # Machine-readable outcome + a one-line plain-English summary.
    outcome: str
    headline: str
    # Key of the first stage whose ``state`` is ``failed`` — where the verified
    # chain broke. ``None`` when no stage hard-failed.
    stopped_at_stage: str | None = None
    channels: list[ChannelView]
    measurement_eligibility: MeasurementEligibilityView
    stages: list[ReceiptStageView]
    incidents: list[IncidentRefView] = []
    audit: list[AuditEventView] = []
    generated_at: datetime


# ---------------------------------------------------------------------------
# Certification Lab
# ---------------------------------------------------------------------------
class ConnectorProfileView(BaseModel):
    id: str
    name: str
    retailer_name: str
    pos_provider: str
    esl_provider: str
    ecommerce_provider: str
    status: str
    created_at: datetime


class CertificationCheckView(BaseModel):
    id: str
    check_type: str
    scenario_name: str
    status: str
    evidence: dict
    created_at: datetime


class CertificationReport(BaseModel):
    run_id: str
    status: str
    final_recommendation: str | None
    started_at: datetime
    completed_at: datetime | None
    batch_external_id: str | None
    connector: ConnectorProfileView
    checks: list[CertificationCheckView]
    summary: dict


# ---------------------------------------------------------------------------
# Configurable Connector Test Runner (scenarios)
# ---------------------------------------------------------------------------
class ConnectorBehaviorIn(BaseModel):
    store_id: str
    sku: str
    channel_type: str  # pos | esl | ecommerce
    behavior_type: str  # success | stale_price | timeout | timeout_then_success | duplicate_ack
    configured_observed_price: float | None = None
    configured_delay_ms: int | None = None
    retry_success_price: float | None = None


class ScenarioActionIn(BaseModel):
    product_name: str
    sku: str
    previous_price: float
    approved_price: float
    reason: str = "Price update"
    is_kvi: bool = False
    deadline_at: datetime | None = None


# ─── Bulk import preview ──────────────────────────────────────────────
class BulkImportRequest(BaseModel):
    format: str  # "csv" | "tsv" | "json"
    content: str


class BulkImportRowView(BaseModel):
    row_number: int
    valid: bool
    errors: list[str] = []
    sku: str = ""
    product_name: str = ""
    previous_price: float = 0.0
    approved_price: float = 0.0
    reason: str = "Bulk imported"
    is_kvi: bool = False
    deadline_at: str | None = None


class BulkImportPreviewResponse(BaseModel):
    format: str
    summary: dict[str, int]
    payload_errors: list[str] = []
    rows: list[BulkImportRowView]
    blank_rows_skipped: int = 0
    source_sha256: str = ""
    schema_version: str = "bulk-import-v1"


class ScenarioIn(BaseModel):
    name: str
    run_mode: str = "live_rollout"
    environment: str = "simulated_production"
    zone_name: str = "Custom Zone"
    store_ids: list[str]
    canary_store_ids: list[str]
    actions: list[ScenarioActionIn]
    behaviors: list[ConnectorBehaviorIn] = []
    import_source_hash: str | None = None
    import_source_name: str | None = None
    import_summary: dict | None = None


class ConnectorBehaviorView(ConnectorBehaviorIn):
    id: str


class ScenarioActionView(ScenarioActionIn):
    id: str


class ScenarioView(BaseModel):
    id: str
    name: str
    run_mode: str
    environment: str
    zone_name: str
    store_ids: list[str]
    canary_store_ids: list[str]
    is_seeded: bool
    import_source_hash: str | None = None
    import_source_name: str | None = None
    import_summary: dict | None = None
    created_by: str | None = None
    created_at: datetime
    actions: list[ScenarioActionView]
    behaviors: list[ConnectorBehaviorView]


class ScenarioExecuteResult(BaseModel):
    mode: str
    redirect: str
    scenario_id: str
    batch_external_id: str | None = None
    run_id: str | None = None


# ---------------------------------------------------------------------------
# Real Data Replay (public-source records)
# ---------------------------------------------------------------------------
class SourceDatasetView(BaseModel):
    id: str
    source_type: str
    source_name: str
    attribution_text: str
    source_url: str
    license_or_usage_note: str
    imported_at: datetime


class SourceObservationView(BaseModel):
    id: str
    source_dataset_id: str
    source: SourceDatasetView
    external_record_id: str
    observation_type: str
    product_name: str
    category: str | None
    brand: str | None
    gtin_upc: str | None
    region: str | None
    observation_date: str | None
    observed_price: float | None
    normalized: dict
    raw_payload: dict
    imported_at: datetime


class CreateScenarioFromObservationIn(BaseModel):
    mode: str = "live_rollout"  # live_rollout | certification
    name: str | None = None
    zone_name: str | None = None
    store_ids: list[str] | None = None
    canary_store_ids: list[str] | None = None
    approved_price: float | None = None
    previous_price: float | None = None
    reason: str | None = None
    behaviors: list["ConnectorBehaviorIn"] | None = None


# ---------------------------------------------------------------------------
# Ask ShelfTrace — deterministic explain endpoint
# ---------------------------------------------------------------------------
class ExplainRequest(BaseModel):
    query: str = Field(..., description="Plain-English question about batch/zone/product state.")


class ExplainResponse(BaseModel):
    answer: str = Field(..., description="Deterministic, template-driven explanation derived from live DB state.")
    evidence_chips: list[str] = Field(default_factory=list, description="Labels of the evidence nodes backing the answer.")
    zone_status: dict[str, str] = Field(default_factory=dict, description="store_id → human-readable status label.")
    measurement_gate: str = Field(..., description="QUARANTINED | ELIGIBLE | PENDING")


# ---------------------------------------------------------------------------
# Override Memory / Regression Replay — a resolved failure becomes a durable,
# replayable case that protects future batches against the same failure mode.
# ---------------------------------------------------------------------------
class RegressionCaseView(BaseModel):
    id: str
    case_type: str = Field(..., description="connector_certification | match_relationship | markdown_fallback")
    title: str
    origin_incident_id: str | None = None
    origin_action_id: str | None = None
    sku: str | None = None
    store_id: str | None = None
    channel: str | None = None
    expected_behavior: str = Field(..., description="What must now be guaranteed for this SKU/store/channel.")
    failure_signature: str = Field(..., description="What went wrong, captured from real row data.")
    status: str = Field(..., description="active | replayed | retired")
    created_at: datetime
    last_replayed_at: datetime | None = None


class RegressionCaseCreateIn(BaseModel):
    """Optional overrides when capturing a regression case from an incident.
    ``case_type`` is auto-derived from the incident when omitted."""

    case_type: str | None = Field(
        default=None,
        description="Override the auto-derived case type "
        "(connector_certification | match_relationship | markdown_fallback).",
    )


class RegressionReplayResult(BaseModel):
    """Result of replaying a saved regression case through the shared engine."""

    case_id: str
    status: str = Field(..., description="The case status after replay (typically 'replayed').")
    healed: bool = Field(..., description="True when the replay re-exercised the failure and it now passes.")
    certification_run_id: str | None = Field(
        default=None, description="The certification run that re-exercised this case, when one was used."
    )
    check_id: str | None = Field(
        default=None, description="The certification check row recording this replay, when one was created."
    )
    redirect: str = Field(..., description="Suggested UI redirect target for the replay result.")
    detail: str = Field(..., description="Plain-English summary of the replay outcome.")
