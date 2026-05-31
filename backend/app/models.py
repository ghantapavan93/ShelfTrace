from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# JSON column type: JSONB on Postgres (indexable, validated, smaller),
# generic JSON elsewhere (SQLite stores as TEXT but SQLAlchemy handles the
# (de)serialization so callers always work with native dicts).
JSONColumn = JSON().with_variant(JSONB(), "postgresql")


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class RunMode(str, enum.Enum):
    CERTIFICATION = "certification"
    LIVE_ROLLOUT = "live_rollout"


class Environment(str, enum.Enum):
    SANDBOX = "sandbox"
    SIMULATED_PRODUCTION = "simulated_production"


class ConnectorStatus(str, enum.Enum):
    PENDING_CERTIFICATION = "pending_certification"
    CERTIFIED = "certified"
    FAILED = "failed"


class CertificationRunStatus(str, enum.Enum):
    RUNNING = "running"
    FAILED_PENDING_REMEDIATION = "failed_pending_remediation"
    PASSED = "passed"


class CheckType(str, enum.Enum):
    PRICE_AGREEMENT = "price_agreement"
    MARKDOWN_SLA = "markdown_sla"
    ECOMMERCE_VERIFICATION = "ecommerce_verification"
    IDEMPOTENT_BATCH = "idempotent_batch"
    RECOVERY_SAFETY = "recovery_safety"
    CANARY_PROTECTION = "canary_protection"


class CheckStatus(str, enum.Enum):
    PASSED = "passed"
    FAILED = "failed"
    RECOVERED = "recovered"


class BehaviorType(str, enum.Enum):
    SUCCESS = "success"
    STALE_PRICE = "stale_price"
    TIMEOUT = "timeout"
    TIMEOUT_THEN_SUCCESS = "timeout_then_success"
    DUPLICATE_ACK = "duplicate_ack"


class SourceDatasetType(str, enum.Enum):
    USDA_FDC = "usda_fdc"
    USDA_AMS = "usda_ams"
    OPEN_PRICES = "open_prices"


class RegressionCaseType(str, enum.Enum):
    """How a saved failure should be re-exercised when replayed."""

    CONNECTOR_CERTIFICATION = "connector_certification"  # POS/price mismatch
    MATCH_RELATIONSHIP = "match_relationship"
    MARKDOWN_FALLBACK = "markdown_fallback"  # deadline / ESL timeout


class RegressionCaseStatus(str, enum.Enum):
    ACTIVE = "active"  # captured, guards future batches, not yet replayed
    REPLAYED = "replayed"  # re-exercised through the shared engine at least once
    RETIRED = "retired"  # operator decided the failure mode no longer applies


class ObservationType(str, enum.Enum):
    PRODUCT_IDENTITY = "product_identity"
    ADVERTISED_PRICE = "advertised_price"


class BatchStatus(str, enum.Enum):
    RECEIVED = "received"
    CANARY_PUBLISHING = "canary_publishing"
    CANARY_VERIFYING = "canary_verifying"
    BLOCKED = "blocked"  # >=1 canary action has a critical mismatch
    PARTIALLY_BLOCKED = "partially_blocked"  # no critical, but actions still retrying/pending
    READY_FOR_EXPANSION = "ready_for_expansion"  # all canary actions verified
    EXPANDING = "expanding"
    COMPLETED = "completed"  # expansion verified across all stores


class Channel(str, enum.Enum):
    POS = "pos"
    ESL = "esl"
    ECOMMERCE = "ecommerce"


class DeliveryStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    ACKED = "acked"
    TIMEOUT = "timeout"
    FAILED = "failed"


class ReceiptStatus(str, enum.Enum):
    VERIFIED = "verified"
    MISMATCH = "mismatch"
    TIMEOUT = "timeout"


class ActionDecision(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    ELIGIBLE = "eligible"
    RETRY = "retry"
    BLOCKED = "blocked"


class IncidentType(str, enum.Enum):
    PRICE_MISMATCH = "price_mismatch"
    CHANNEL_TIMEOUT = "channel_timeout"
    DEADLINE_RISK = "deadline_risk"


class IncidentSeverity(str, enum.Enum):
    CRITICAL = "critical"
    URGENT = "urgent"
    WARNING = "warning"


class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    RETRYING = "retrying"
    RESOLVED = "resolved"
    ROLLED_BACK = "rolled_back"


class OutboxStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    PROCESSED = "processed"
    RETRYING = "retrying"
    DEAD_LETTER = "dead_letter"


class StoreTaskStatus(str, enum.Enum):
    OPEN = "open"
    DONE = "done"


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------
class PriceBatch(Base):
    __tablename__ = "price_batches"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    external_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    idempotency_key: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    zone: Mapped[str] = mapped_column(String)
    status: Mapped[BatchStatus] = mapped_column(Enum(BatchStatus), default=BatchStatus.RECEIVED)
    # native_enum=False -> stored as VARCHAR so the additive migration can add
    # these columns to a pre-existing price_batches table without a PG enum type.
    run_mode: Mapped[RunMode] = mapped_column(
        Enum(RunMode, native_enum=False, length=32), default=RunMode.LIVE_ROLLOUT, index=True
    )
    environment: Mapped[Environment] = mapped_column(
        Enum(Environment, native_enum=False, length=32), default=Environment.SIMULATED_PRODUCTION
    )
    connector_profile_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Links the batch to the scenario configuration that produced it (drives adapter behavior).
    scenario_config_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    approved_by: Mapped[str] = mapped_column(String, default="upstream-pricing-system")
    total_store_count: Mapped[int] = mapped_column(Integer, default=4)
    expansion_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    block_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Real backend data-scope marker. Live mode filters source_run_id LIKE 'user:%';
    # Demo mode includes everything. NULL = legacy unscoped data. See app/scope.py.
    source_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    actions: Mapped[list[PriceAction]] = relationship(back_populates="batch", cascade="all, delete-orphan")
    rollout_groups: Mapped[list[RolloutGroup]] = relationship(back_populates="batch", cascade="all, delete-orphan")


class PriceAction(Base):
    __tablename__ = "price_actions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("price_batches.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String, index=True)
    product_name: Mapped[str] = mapped_column(String)
    store_id: Mapped[str] = mapped_column(String, index=True)
    approved_price: Mapped[float] = mapped_column(Float)
    prior_price: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String)
    # Upstream context (preserved, not recomputed)
    is_kvi: Mapped[bool] = mapped_column(Boolean, default=False)
    is_perishable: Mapped[bool] = mapped_column(Boolean, default=False)
    markdown_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    projected_impact: Mapped[str | None] = mapped_column(String, nullable=True)
    decision: Mapped[ActionDecision] = mapped_column(Enum(ActionDecision), default=ActionDecision.PENDING)

    batch: Mapped[PriceBatch] = relationship(back_populates="actions")
    deliveries: Mapped[list[ChannelDelivery]] = relationship(back_populates="action", cascade="all, delete-orphan")


class RolloutGroup(Base):
    __tablename__ = "rollout_groups"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("price_batches.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String)  # "canary" | "expansion"
    store_ids_csv: Mapped[str] = mapped_column(Text)  # comma-separated store ids
    active: Mapped[bool] = mapped_column(Boolean, default=False)

    batch: Mapped[PriceBatch] = relationship(back_populates="rollout_groups")

    @property
    def store_ids(self) -> list[str]:
        return [s for s in self.store_ids_csv.split(",") if s]


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_type: Mapped[str] = mapped_column(String, index=True)
    aggregate_id: Mapped[str] = mapped_column(String, index=True)
    # Stored as JSONB on Postgres (indexable, validated). SQLAlchemy handles
    # (de)serialization so callers always work with native dicts.
    payload_json: Mapped[dict] = mapped_column(JSONColumn)
    status: Mapped[OutboxStatus] = mapped_column(Enum(OutboxStatus), default=OutboxStatus.PENDING, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    # When set, the outbox worker skips this event until utcnow() >= next_attempt_at.
    # Drives exponential backoff with jitter on retry (see services.orchestrator).
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    # Latest error from a failed attempt, surfaced in dead-letter alerts.
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChannelDelivery(Base):
    __tablename__ = "channel_deliveries"
    __table_args__ = (UniqueConstraint("action_id", "channel", name="uq_delivery_action_channel"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    action_id: Mapped[str] = mapped_column(ForeignKey("price_actions.id", ondelete="CASCADE"), index=True)
    channel: Mapped[Channel] = mapped_column(Enum(Channel))
    status: Mapped[DeliveryStatus] = mapped_column(Enum(DeliveryStatus), default=DeliveryStatus.PENDING)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    action: Mapped[PriceAction] = relationship(back_populates="deliveries")
    receipt: Mapped[ExecutionReceipt | None] = relationship(
        back_populates="delivery", uselist=False, cascade="all, delete-orphan"
    )


class ExecutionReceipt(Base):
    __tablename__ = "execution_receipts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    delivery_id: Mapped[str] = mapped_column(ForeignKey("channel_deliveries.id", ondelete="CASCADE"), index=True)
    channel: Mapped[Channel] = mapped_column(Enum(Channel))
    expected_price: Mapped[float] = mapped_column(Float)
    observed_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[ReceiptStatus] = mapped_column(Enum(ReceiptStatus))
    raw_payload_json: Mapped[dict] = mapped_column(JSONColumn)  # source payload preserved (JSONB on PG)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    delivery: Mapped[ChannelDelivery] = relationship(back_populates="receipt")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("price_batches.id", ondelete="CASCADE"), index=True)
    action_id: Mapped[str] = mapped_column(ForeignKey("price_actions.id", ondelete="CASCADE"), index=True)
    type: Mapped[IncidentType] = mapped_column(Enum(IncidentType))
    severity: Mapped[IncidentSeverity] = mapped_column(Enum(IncidentSeverity))
    status: Mapped[IncidentStatus] = mapped_column(Enum(IncidentStatus), default=IncidentStatus.OPEN, index=True)
    summary: Mapped[str] = mapped_column(Text)
    offending_channel: Mapped[Channel | None] = mapped_column(Enum(Channel), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Operator acknowledgement (human-in-the-loop ownership). Modeled as a
    # timestamp + actor rather than an IncidentStatus value so an incident can
    # be acknowledged AND still retrying (PagerDuty-style — ack is orthogonal to
    # the recovery lifecycle). The reliability guarantee: no incident leaves the
    # OPEN state via a recovery action without an acknowledgement on record.
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(128), nullable=True)


class StoreTask(Base):
    __tablename__ = "store_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    store_id: Mapped[str] = mapped_column(String, index=True)
    instruction: Mapped[str] = mapped_column(Text)
    status: Mapped[StoreTaskStatus] = mapped_column(Enum(StoreTaskStatus), default=StoreTaskStatus.OPEN)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    batch_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    incident_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    action_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    event: Mapped[str] = mapped_column(String)
    detail: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String, default="system")  # system | automated | operator
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------------------
# Certification Lab (reuses the same execution engine as live rollout)
# ---------------------------------------------------------------------------
class ConnectorProfile(Base):
    __tablename__ = "connector_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    retailer_name: Mapped[str] = mapped_column(String)
    pos_provider: Mapped[str] = mapped_column(String)
    esl_provider: Mapped[str] = mapped_column(String)
    ecommerce_provider: Mapped[str] = mapped_column(String)
    status: Mapped[ConnectorStatus] = mapped_column(
        Enum(ConnectorStatus), default=ConnectorStatus.PENDING_CERTIFICATION
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CertificationRun(Base):
    __tablename__ = "certification_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    connector_profile_id: Mapped[str] = mapped_column(
        ForeignKey("connector_profiles.id", ondelete="CASCADE"), index=True
    )
    batch_id: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[CertificationRunStatus] = mapped_column(
        Enum(CertificationRunStatus), default=CertificationRunStatus.RUNNING
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)

    checks: Mapped[list[CertificationCheck]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class CertificationCheck(Base):
    __tablename__ = "certification_checks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    certification_run_id: Mapped[str] = mapped_column(
        ForeignKey("certification_runs.id", ondelete="CASCADE"), index=True
    )
    check_type: Mapped[CheckType] = mapped_column(Enum(CheckType))
    scenario_name: Mapped[str] = mapped_column(String)
    status: Mapped[CheckStatus] = mapped_column(Enum(CheckStatus))
    evidence_json: Mapped[dict] = mapped_column(JSONColumn)  # JSONB-backed evidence (PG); dict in code
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    run: Mapped[CertificationRun] = relationship(back_populates="checks")


# ---------------------------------------------------------------------------
# Configurable Connector Test Runner — scenarios drive adapter behavior so the
# engine is reusable, not hardcoded to specific products.
# ---------------------------------------------------------------------------
class TestRunConfig(Base):
    __tablename__ = "test_run_configs"
    __test__ = False  # not a pytest test class

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    run_mode: Mapped[RunMode] = mapped_column(Enum(RunMode, native_enum=False, length=32), default=RunMode.LIVE_ROLLOUT)
    environment: Mapped[Environment] = mapped_column(
        Enum(Environment, native_enum=False, length=32), default=Environment.SIMULATED_PRODUCTION
    )
    zone_name: Mapped[str] = mapped_column(String, default="Custom Zone")
    store_ids_csv: Mapped[str] = mapped_column(Text, default="")
    canary_store_ids_csv: Mapped[str] = mapped_column(Text, default="")
    is_seeded: Mapped[bool] = mapped_column(Boolean, default=False)
    import_source_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    import_source_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    import_summary_json: Mapped[dict | None] = mapped_column(JSONColumn, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Optional link to a real public-data observation this scenario was created from.
    source_observation_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    actions: Mapped[list[TestRunAction]] = relationship(back_populates="config", cascade="all, delete-orphan")
    behaviors: Mapped[list[ConnectorBehaviorProfile]] = relationship(
        back_populates="config", cascade="all, delete-orphan"
    )

    @property
    def store_ids(self) -> list[str]:
        return [s for s in self.store_ids_csv.split(",") if s]

    @property
    def canary_store_ids(self) -> list[str]:
        return [s for s in self.canary_store_ids_csv.split(",") if s]


class TestRunAction(Base):
    __tablename__ = "test_run_actions"
    __test__ = False  # not a pytest test class

    id: Mapped[str] = mapped_column(String, primary_key=True)
    test_run_config_id: Mapped[str] = mapped_column(
        ForeignKey("test_run_configs.id", ondelete="CASCADE"), index=True
    )
    product_name: Mapped[str] = mapped_column(String)
    sku: Mapped[str] = mapped_column(String)
    previous_price: Mapped[float] = mapped_column(Float)
    approved_price: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String, default="Price update")
    is_kvi: Mapped[bool] = mapped_column(Boolean, default=False)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    config: Mapped[TestRunConfig] = relationship(back_populates="actions")


# ---------------------------------------------------------------------------
# Real Data Replay — public source records imported with provenance and then
# turned into ShelfTrace execution scenarios.
# ---------------------------------------------------------------------------
class SourceDataset(Base):
    __tablename__ = "source_datasets"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_type: Mapped[SourceDatasetType] = mapped_column(
        Enum(SourceDatasetType, native_enum=False, length=32), index=True
    )
    source_name: Mapped[str] = mapped_column(String)
    attribution_text: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text)
    license_or_usage_note: Mapped[str] = mapped_column(Text)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    observations: Mapped[list[SourceObservation]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class SourceObservation(Base):
    __tablename__ = "source_observations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_dataset_id: Mapped[str] = mapped_column(
        ForeignKey("source_datasets.id", ondelete="CASCADE"), index=True
    )
    external_record_id: Mapped[str] = mapped_column(String, index=True)
    observation_type: Mapped[ObservationType] = mapped_column(
        Enum(ObservationType, native_enum=False, length=32)
    )
    product_name: Mapped[str] = mapped_column(String)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    gtin_upc: Mapped[str | None] = mapped_column(String, nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    observation_date: Mapped[str | None] = mapped_column(String, nullable=True)
    observed_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_payload_json: Mapped[str] = mapped_column(Text)
    normalized_payload_json: Mapped[str] = mapped_column(Text)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    dataset: Mapped[SourceDataset] = relationship(back_populates="observations")


# ---------------------------------------------------------------------------
# Override Memory / Regression Replay — a resolved failure or human correction
# becomes a durable, replayable case so the next batch is protected against the
# same failure mode. Net-new self-contained table; create_all provisions it
# (no db_migrate column entry needed). Enums are native_enum=False -> VARCHAR.
# ---------------------------------------------------------------------------
class RegressionCase(Base):
    __tablename__ = "regression_cases"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    case_type: Mapped[RegressionCaseType] = mapped_column(
        Enum(RegressionCaseType, native_enum=False, length=32), index=True
    )
    title: Mapped[str] = mapped_column(String)
    # The incident / action the case was learned from (nullable so a case can be
    # authored without an originating incident if needed).
    origin_incident_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    origin_action_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    sku: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    store_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    channel: Mapped[str | None] = mapped_column(String, nullable=True)  # pos | esl | ecommerce
    # What must now be guaranteed, e.g. "POS must acknowledge approved price $5.99".
    expected_behavior: Mapped[str] = mapped_column(Text)
    # What went wrong, e.g. "POS returned $6.49 vs approved $5.99".
    failure_signature: Mapped[str] = mapped_column(Text)
    # Snapshot of the incident/receipt state at creation (JSON as Text — matches
    # the SourceObservation *_json convention so a fresh create_all needs no
    # JSONB target entry).
    source_payload_json: Mapped[str] = mapped_column(Text)
    status: Mapped[RegressionCaseStatus] = mapped_column(
        Enum(RegressionCaseStatus, native_enum=False, length=32),
        default=RegressionCaseStatus.ACTIVE,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_replayed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConnectorBehaviorProfile(Base):
    __tablename__ = "connector_behavior_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    test_run_config_id: Mapped[str] = mapped_column(
        ForeignKey("test_run_configs.id", ondelete="CASCADE"), index=True
    )
    store_id: Mapped[str] = mapped_column(String, index=True)
    sku: Mapped[str] = mapped_column(String, index=True)
    channel_type: Mapped[Channel] = mapped_column(Enum(Channel, native_enum=False, length=16))
    behavior_type: Mapped[BehaviorType] = mapped_column(Enum(BehaviorType, native_enum=False, length=32))
    configured_observed_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    configured_delay_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retry_success_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    config: Mapped[TestRunConfig] = relationship(back_populates="behaviors")


# ---------------------------------------------------------------------------
# Competitor scraping — feeds the pricing engine reference prices.
# stable_key = f"{source_id}:{external_id}" lets us upsert across runs
# without duplicating rows when the same product re-appears.
# ---------------------------------------------------------------------------
class CompetitorProduct(Base):
    __tablename__ = "competitor_products"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_id: Mapped[str] = mapped_column(String, index=True)
    external_id: Mapped[str] = mapped_column(String, index=True)
    stable_key: Mapped[str] = mapped_column(String, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(256))
    price: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    availability: Mapped[str | None] = mapped_column(String(32), nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_attributes: Mapped[dict] = mapped_column(JSONColumn, default=dict)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    observation_count: Mapped[int] = mapped_column(Integer, default=1)


class ScrapeRun(Base):
    __tablename__ = "scrape_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_id: Mapped[str] = mapped_column(String, index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pages_fetched: Mapped[int] = mapped_column(Integer, default=0)
    pages_skipped_by_robots: Mapped[int] = mapped_column(Integer, default=0)
    products_seen: Mapped[int] = mapped_column(Integer, default=0)
    products_inserted: Mapped[int] = mapped_column(Integer, default=0)
    products_updated: Mapped[int] = mapped_column(Integer, default=0)
    products_rejected: Mapped[int] = mapped_column(Integer, default=0)
    price_changes_detected: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    errors_json: Mapped[dict] = mapped_column(JSONColumn, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="running")  # running|success|failed


class CompetitorPriceHistory(Base):
    """Append-only log of price changes for each stable_key.

    The CompetitorProduct table holds only the current price. This table
    keeps the trend — essential for the pricing engine downstream
    (elasticity estimation against competitor moves) and for any
    "competitor dropped 30% in 2 days, alert!" signal.
    """

    __tablename__ = "competitor_price_history"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    stable_key: Mapped[str] = mapped_column(String, index=True)
    price: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    delta_pct: Mapped[float | None] = mapped_column(Float, nullable=True)  # change vs last observation
    scrape_run_id: Mapped[str | None] = mapped_column(String, nullable=True)


# ---------------------------------------------------------------------------
# Pricing engine — historical sales, cost catalog, recommendations
# ---------------------------------------------------------------------------
class HistoricalSale(Base):
    """One (sku, store_id, date) observation. Powers elasticity estimation.
    Synthetic data seeded by `app.pricing.seed.seed_history()` for the demo;
    in production replaced by real POS exports."""

    __tablename__ = "historical_sales"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sku: Mapped[str] = mapped_column(String, index=True)
    store_id: Mapped[str] = mapped_column(String, index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    price: Mapped[float] = mapped_column(Float)
    units_sold: Mapped[int] = mapped_column(Integer)
    on_promotion: Mapped[bool] = mapped_column(Boolean, default=False)
    source_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)


class ProductCost(Base):
    __tablename__ = "product_costs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sku: Mapped[str] = mapped_column(String, unique=True, index=True)
    cost: Mapped[float] = mapped_column(Float)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    source_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)


class PricingRecommendation(Base):
    __tablename__ = "pricing_recommendations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sku: Mapped[str] = mapped_column(String, index=True)
    store_id: Mapped[str] = mapped_column(String, index=True)
    product_name: Mapped[str] = mapped_column(String(256))
    current_price: Mapped[float] = mapped_column(Float)
    recommended_price: Mapped[float] = mapped_column(Float)
    expected_units_lift_pct: Mapped[float] = mapped_column(Float, default=0.0)
    expected_revenue_lift: Mapped[float] = mapped_column(Float, default=0.0)
    expected_profit_lift: Mapped[float] = mapped_column(Float, default=0.0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    elasticity_beta: Mapped[float | None] = mapped_column(Float, nullable=True)
    elasticity_beta_se: Mapped[float | None] = mapped_column(Float, nullable=True)
    elasticity_ci_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    elasticity_ci_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    elasticity_r2: Mapped[float | None] = mapped_column(Float, nullable=True)
    elasticity_n: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reasons_json: Mapped[dict] = mapped_column(JSONColumn, default=dict)
    applied: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    superseded_by: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    applied_to_scenario_id: Mapped[str | None] = mapped_column(String, nullable=True)
    source_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ExternalSignal(Base):
    """Demand multipliers for events / holidays / weather. Active rows
    are read by the pricing engine at run time. Persisted so the system
    has an audit trail of 'why did we boost demand on those SKUs'."""

    __tablename__ = "external_signals"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    signal_type: Mapped[str] = mapped_column(String(32))  # holiday|weather|competitor|event
    multiplier: Mapped[float] = mapped_column(Float)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    effective_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    category_pattern: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sku_pattern: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Data-scope tag so the pricing engine applies a signal only to
    # recommendations on the SAME side of the Live/Demo boundary — a seeded
    # demo signal must not silently multiply a user-scoped rec's demand.
    source_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------------------
# Cross-source product knowledge graph
# ---------------------------------------------------------------------------
class ProductCategory(Base):
    """Hierarchical product categories. Enables "all beverages" or "frozen aisles"
    queries. parent_id=None for root categories."""

    __tablename__ = "product_categories"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("product_categories.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProductEntity(Base):
    """Canonical product entity that unifies the same physical product across
    sources. 'Organic Large Eggs' is one entity even if sold by Whole Foods,
    Amazon Fresh, and Target. Manually curated or auto-matched via title/category."""

    __tablename__ = "product_entities"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    canonical_title: Mapped[str] = mapped_column(String(256), index=True)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    brand: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    upc: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)  # universal product code
    unit_size: Mapped[str | None] = mapped_column(String(64), nullable=True)  # e.g. "12-pack", "1 dozen"
    attributes: Mapped[dict] = mapped_column(JSONColumn, default=dict)  # {color, size, organic, etc}
    match_confidence: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1, auto-match score
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)  # true if curator-approved
    source_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    competitor_products: Mapped[list[CompetitorProductEntity]] = relationship(
        back_populates="entity", cascade="all, delete-orphan"
    )
    sku_links: Mapped[list[SKUProductLink]] = relationship(
        back_populates="entity", cascade="all, delete-orphan"
    )


class CompetitorProductEntity(Base):
    """Junction: links a competitor_product to a canonical ProductEntity.
    Allows querying 'all sources carrying this product' or 'which entity
    does this Whole Foods item belong to?'"""

    __tablename__ = "competitor_product_entities"
    __table_args__ = (UniqueConstraint("competitor_product_id", "entity_id", name="uq_competitor_entity"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    competitor_product_id: Mapped[str] = mapped_column(ForeignKey("competitor_products.id", ondelete="CASCADE"), index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("product_entities.id", ondelete="CASCADE"), index=True)
    match_score: Mapped[float] = mapped_column(Float, default=0.0)  # title similarity, category match, etc
    matched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    entity: Mapped[ProductEntity] = relationship(back_populates="competitor_products")


class SKUProductLink(Base):
    """Links our internal SKUs to canonical ProductEntity. One SKU can link
    to one entity; one entity can be referenced by many SKUs (zone variants)."""

    __tablename__ = "sku_product_links"
    __table_args__ = (UniqueConstraint("sku", "entity_id", name="uq_sku_entity"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sku: Mapped[str] = mapped_column(String, index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("product_entities.id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)  # optional zone scope
    source_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    entity: Mapped[ProductEntity] = relationship(back_populates="sku_links")


class CompetitorPriceObservation(Base):
    """Enhanced price history: tracks not just price but source, SKU mapping,
    competitor product entity alignment. Enables queries like 'when competitor
    X dropped price on entity Y, what happened to our margin?'"""

    __tablename__ = "competitor_price_observations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    competitor_product_id: Mapped[str] = mapped_column(ForeignKey("competitor_products.id", ondelete="CASCADE"), index=True)
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("product_entities.id", ondelete="SET NULL"), nullable=True, index=True)
    price: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    zone_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    store_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    delta_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    scrape_run_id: Mapped[str | None] = mapped_column(String, nullable=True)
    source_run_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

