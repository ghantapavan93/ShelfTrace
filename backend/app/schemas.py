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


class BatchDetail(BatchSummary):
    actions: list[ActionView]


class IncidentView(BaseModel):
    id: str
    batch_id: str
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


class ScenarioIn(BaseModel):
    name: str
    run_mode: str = "live_rollout"
    environment: str = "simulated_production"
    zone_name: str = "Custom Zone"
    store_ids: list[str]
    canary_store_ids: list[str]
    actions: list[ScenarioActionIn]
    behaviors: list[ConnectorBehaviorIn] = []


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
    created_at: datetime
    actions: list[ScenarioActionView]
    behaviors: list[ConnectorBehaviorView]


class ScenarioExecuteResult(BaseModel):
    mode: str
    redirect: str
    scenario_id: str
    batch_external_id: str | None = None
    run_id: str | None = None
