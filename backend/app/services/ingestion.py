from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.ids import new_id
from app.models import (
    BatchStatus,
    Environment,
    OutboxEvent,
    OutboxStatus,
    PriceAction,
    PriceBatch,
    RolloutGroup,
    RunMode,
)
from app.schemas import PriceBatchIn
from app.services.audit import record_audit


class IngestionResult:
    def __init__(self, batch: PriceBatch, created: bool):
        self.batch = batch
        self.created = created


def ingest_batch(db: Session, payload: PriceBatchIn) -> IngestionResult:
    """Accept an approved price batch.

    Idempotent: the same idempotency_key always maps to a single workflow.
    Batch + actions + rollout groups + outbox events are committed in one
    transaction. If anything fails, no publish work is ever queued.
    """
    existing = db.scalar(
        select(PriceBatch).where(PriceBatch.idempotency_key == payload.idempotency_key)
    )
    if existing is not None:
        return IngestionResult(existing, created=False)

    canary_count = payload.canary_store_count or settings.canary_store_count
    canary_ids = payload.store_ids[:canary_count]
    expansion_ids = payload.store_ids[canary_count:]

    batch = PriceBatch(
        id=new_id("batch"),
        external_id=payload.external_id,
        idempotency_key=payload.idempotency_key,
        name=payload.name,
        zone=payload.zone,
        approved_by=payload.approved_by,
        total_store_count=payload.total_store_count,
        status=BatchStatus.CANARY_PUBLISHING,
        run_mode=RunMode(payload.run_mode),
        environment=Environment(payload.environment),
        connector_profile_id=payload.connector_profile_id,
        scenario_config_id=payload.scenario_config_id,
    )
    db.add(batch)

    # One action per (product, store) across every target store.
    for store_id in payload.store_ids:
        for a in payload.actions:
            db.add(
                PriceAction(
                    id=new_id("action"),
                    batch_id=batch.id,
                    sku=a.sku,
                    product_name=a.product_name,
                    store_id=store_id,
                    approved_price=a.approved_price,
                    prior_price=a.prior_price,
                    reason=a.reason,
                    is_kvi=a.is_kvi,
                    is_perishable=a.is_perishable,
                    markdown_deadline=a.markdown_deadline,
                    projected_impact=a.projected_impact,
                )
            )

    db.add(
        RolloutGroup(
            id=new_id("rg"),
            batch_id=batch.id,
            kind="canary",
            store_ids_csv=",".join(canary_ids),
            active=True,
        )
    )
    db.add(
        RolloutGroup(
            id=new_id("rg"),
            batch_id=batch.id,
            kind="expansion",
            store_ids_csv=",".join(expansion_ids),
            active=False,
        )
    )

    # Queue canary publish work for the canary actions only — same transaction.
    db.flush()
    canary_actions = [a for a in batch.actions if a.store_id in canary_ids]
    for action in canary_actions:
        db.add(
            OutboxEvent(
                id=new_id("evt"),
                event_type="CANARY_PUBLISH_REQUESTED",
                aggregate_id=action.id,
                payload_json=json.dumps({"action_id": action.id, "batch_id": batch.id}),
                status=OutboxStatus.PENDING,
            )
        )

    record_audit(
        db,
        batch_id=batch.id,
        event="Approved batch accepted",
        detail=f"Batch {payload.external_id} accepted with {len(payload.actions)} approved "
        f"products across {len(payload.store_ids)} stores. Canary: {', '.join(canary_ids)}.",
        actor="automated",
    )

    db.commit()
    db.refresh(batch)
    return IngestionResult(batch, created=True)
