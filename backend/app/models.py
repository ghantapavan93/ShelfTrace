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
