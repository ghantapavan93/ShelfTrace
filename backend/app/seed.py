from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

logger = logging.getLogger("shelftrace.seed")

from app.models import (
    AuditEvent,
    OutboxEvent,
    PriceBatch,
)
from app.schemas import ApprovedActionIn, PriceBatchIn

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
    """Reset the live-rollout demo to its blocked state by executing the seeded
    Memorial Day scenario configuration (config-driven, not hardcoded)."""
    from app.services import scenarios  # lazy import to avoid a module cycle

    config = scenarios.ensure_memorial_day(db)
    return scenarios.execute_live(db, config)


# Backwards-compatible alias.
seed_demo = seed_live


# The two seeded "hero" live-rollout demos. (MILK_HERO_EXTERNAL_ID mirrors the
# constant in services/scenarios.py; duplicated here as a literal to avoid a
# circular import — scenarios.py already imports wipe_batch from this module.)
MILK_HERO_EXTERNAL_ID = "milk-hero-dallas-02"
# The Realistic Scale catalog is a LIVE_ROLLOUT batch (COMPLETED), so it must be
# preserved by purge_non_seed_live_batches — it's a demo showcase, not debris.
REALISTIC_SCALE_EXTERNAL_ID = "realistic-scale-catalog"
SEED_LIVE_EXTERNAL_IDS = {DEMO_EXTERNAL_ID, MILK_HERO_EXTERNAL_ID, REALISTIC_SCALE_EXTERNAL_ID}


def purge_non_seed_live_batches(db: Session) -> int:
    """Remove executed LIVE_ROLLOUT batches that aren't one of the seeded hero
    demos, so a reset restores a bounded, debris-free Operations view.

    This is what makes demo reset idempotent: two consecutive resets leave the
    SAME set of live batches (the two heroes), instead of letting realistic-scale
    runs and prior-session scenarios accumulate. Saved scenario CONFIGS are
    preserved — only their stale executed batches are cleared, so a reviewer's
    saved scenarios survive a reset and can be re-run. Returns the count removed.
    """
    from app.models import RunMode  # local import keeps module load order simple

    stale = db.scalars(
        select(PriceBatch).where(
            PriceBatch.run_mode == RunMode.LIVE_ROLLOUT,
            PriceBatch.external_id.notin_(SEED_LIVE_EXTERNAL_IDS),
        )
    ).all()
    for batch in stale:
        wipe_batch(db, batch.external_id)
    return len(stale)


# ---------------------------------------------------------------------------
# Live/Demo data-scope hygiene
# ---------------------------------------------------------------------------
# Tables carrying the source_run_id data-scope column (mirrors scope._SOURCE...).
# product_entities is listed LAST so its DB-level ondelete=CASCADE tidies any
# remaining sku_product_links / competitor_product_entity junction rows.
_USER_SCOPE_TABLES = (
    "sku_product_links",
    "competitor_price_observations",
    "product_costs",
    "historical_sales",
    "pricing_recommendations",
    "external_signals",
    "product_entities",
)


def purge_user_scope(db: Session) -> dict:
    """Make Live mode a TRUE clean slate.

    Deletes every user-scoped row (``source_run_id LIKE 'user:%'`` — which
    includes the ``user:legacy`` backfill bucket of pre-scoping rows) across the
    data-scope tables. ``demo:%`` rows are never touched, so the curated Demo
    showcase is fully preserved. This is what makes a portfolio-demo instance
    present an empty "bring your own data" Live surface: Live = user uploads only,
    and on a fresh boot there are none. Returns per-table delete counts.
    """
    from sqlalchemy import text as _text

    counts: dict[str, int] = {}
    # Live batches first — wipe_batch cascades actions → deliveries → receipts,
    # incidents → store_tasks, rollout_groups, plus outbox + audit rows.
    user_batches = db.scalars(
        select(PriceBatch).where(PriceBatch.source_run_id.like("user:%"))
    ).all()
    for b in user_batches:
        wipe_batch(db, b.external_id)
    counts["price_batches"] = len(user_batches)
    for table in _USER_SCOPE_TABLES:
        res = db.execute(_text(f"DELETE FROM {table} WHERE source_run_id LIKE 'user:%'"))
        counts[table] = res.rowcount or 0
    db.commit()
    return counts


def ensure_realistic_scale_demo(db: Session) -> bool:
    """Guarantee Demo mode shows the system's FULL POTENTIAL: the Realistic Scale
    catalog (150-SKU product graph, competitor index, pricing recommendations, KVI
    watchlist, margin targets, substitutes), all demo-scoped.

    Non-destructive and idempotent:
      • If the catalog is absent (a fresh DB), load it (~6s, one-time).
      • Recommendations are ENGINE output, not seed rows, so run the pricing engine
        when no realistic-scale recommendations exist yet (~2s, one-time).
      • Scope correctness for any pre-existing mis-scoped rows (e.g. an old load
        that left entities as 'user:legacy') is fixed IN PLACE by
        db_migrate._reclassify_demo_rows on boot — so existing recommendations,
        history, and competitor observations are PRESERVED, never wiped.

    Cheap (two small SELECTs) once everything is present. Returns True if it did
    any work. Safe to call on every boot.
    """
    from app.models import PricingRecommendation, SKUProductLink
    from app.scenarios.realistic_scale import CATALOG, load_realistic_scale
    from app.scope import DEMO_REALISTIC_SCALE

    did_work = False
    sample = db.scalar(select(SKUProductLink).where(SKUProductLink.sku == CATALOG[0].sku))
    if sample is None:
        load_realistic_scale(db)  # entities, links, costs, history, competitor obs, catalog batch
        did_work = True
    recs = db.scalar(
        select(func.count())
        .select_from(PricingRecommendation)
        .where(PricingRecommendation.source_run_id == DEMO_REALISTIC_SCALE)
    )
    if not recs:
        try:
            from app.pricing.pipeline import run_pricing_engine

            run_pricing_engine(db)  # recommendations are engine output, not loader rows
            did_work = True
        except Exception:
            logger.exception("Realistic Scale pricing-engine run skipped")
    return did_work
