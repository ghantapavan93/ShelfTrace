from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
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
    payload_json: Mapped[str] = mapped_column(Text)
    status: Mapped[OutboxStatus] = mapped_column(Enum(OutboxStatus), default=OutboxStatus.PENDING, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    raw_payload_json: Mapped[str] = mapped_column(Text)  # source payload preserved
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
