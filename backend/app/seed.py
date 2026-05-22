from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    OutboxEvent,
    PriceBatch,
)
from app.schemas import ApprovedActionIn, PriceBatchIn
from app.services import orchestrator
from app.services.ingestion import ingest_batch

DEMO_EXTERNAL_ID = "memorial-day-dallas-02"
DEMO_STORES = ["214", "302", "317", "401"]


def _markdown_deadline() -> datetime:
    # 6 PM today, UTC for determinism in the demo.
    now = datetime.now(timezone.utc)
    return now.replace(hour=18, minute=0, second=0, microsecond=0)


def demo_payload() -> PriceBatchIn:
    return PriceBatchIn(
        external_id=DEMO_EXTERNAL_ID,
        idempotency_key=f"idem-{DEMO_EXTERNAL_ID}",
        name="Memorial Day Batch",
        zone="Dallas Zone 2",
        approved_by="upstream-pricing-system",
        total_store_count=len(DEMO_STORES),
        store_ids=DEMO_STORES,
        actions=[
            ApprovedActionIn(
                sku="egg-cage-free-brown-12",
                product_name="Cage-Free Large Brown Eggs, 12 Count",
                approved_price=4.19,
                prior_price=4.49,
                reason="Competitive response",
                is_kvi=True,
                projected_impact="High-visibility KVI; private-label comparable",
            ),
            ApprovedActionIn(
                sku="strawberry-1lb",
                product_name="Fresh Strawberries, 1 lb",
                approved_price=2.99,
                prior_price=3.99,
                reason="Perishable markdown",
                is_perishable=True,
                markdown_deadline=_markdown_deadline(),
                projected_impact="Sell-through before 6 PM deadline",
            ),
            ApprovedActionIn(
                sku="oj-nfc-premium-52oz",
                product_name="Premium Not-From-Concentrate Orange Juice, 52 oz",
                approved_price=9.49,
                prior_price=9.99,
                reason="Supplier cost change",
                projected_impact="Premium tier",
            ),
        ],
    )


def wipe_batch(db: Session, external_id: str) -> None:
    """Delete a single batch and everything that hangs off it.

    Scoped so the live-rollout and certification demos can be reset
    independently without disturbing each other.
    """
    batch = db.scalar(select(PriceBatch).where(PriceBatch.external_id == external_id))
    if batch is None:
        return
    action_ids = [a.id for a in batch.actions]
    if action_ids:
        db.execute(delete(OutboxEvent).where(OutboxEvent.aggregate_id.in_(action_ids)))
    db.execute(delete(AuditEvent).where(AuditEvent.batch_id == batch.id))
    # Cascades to actions -> deliveries -> receipts, incidents -> store_tasks, rollout_groups.
    db.delete(batch)
    db.commit()


def seed_live(db: Session) -> PriceBatch:
    """Reset ONLY the live-rollout demo (Memorial Day / Dallas Zone 2) to its blocked state."""
    wipe_batch(db, DEMO_EXTERNAL_ID)
    result = ingest_batch(db, demo_payload())
    orchestrator.drain(db)
    db.refresh(result.batch)
    return result.batch


# Backwards-compatible alias.
seed_demo = seed_live
