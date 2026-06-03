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


def _wipe_realistic_scale(db: Session) -> None:
    """Remove EVERY Realistic Scale row — correctly-scoped demo:realistic-scale AND
    any mis-scoped rows for its SKUs (NULL / user:legacy / user:<hash>) — plus its
    competitor products, so the loader can repopulate a clean, internally-consistent
    set. Strictly bounded to the realistic-scale catalog + its SKUs; never touches
    Memorial Day, the milk hero, or genuine user uploads of OTHER SKUs."""
    from sqlalchemy import bindparam
    from sqlalchemy import text as _text

    from app.scenarios.realistic_scale import CATALOG
    from app.scope import DEMO_REALISTIC_SCALE

    rs_skus = [c.sku for c in CATALOG]

    def _ex(sql: str) -> None:
        db.execute(
            _text(sql).bindparams(bindparam("skus", expanding=True)),
            {"scope": DEMO_REALISTIC_SCALE, "skus": rs_skus},
        )

    wipe_batch(db, REALISTIC_SCALE_EXTERNAL_ID)  # cascades its price_actions
    # Competitor products for realistic-scale SKUs (stable_key = '<source>:<sku>').
    # The loader skips observation creation when a stable_key already exists, so
    # orphans from an old load must go for observations to repopulate. Postgres-only
    # split_part; on a fresh SQLite dev DB there are none, so the guard is harmless.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        _ex("DELETE FROM competitor_products WHERE split_part(stable_key, ':', 2) IN :skus")
    for table in ("historical_sales", "pricing_recommendations", "product_costs"):
        _ex(f"DELETE FROM {table} WHERE source_run_id = :scope OR sku IN :skus")
    _ex(
        "DELETE FROM product_entities WHERE source_run_id = :scope "
        "OR id IN (SELECT entity_id FROM sku_product_links WHERE sku IN :skus)"
    )
    _ex("DELETE FROM sku_product_links WHERE source_run_id = :scope OR sku IN :skus")
    db.commit()


def ensure_realistic_scale_demo(db: Session) -> bool:
    """Guarantee Demo mode shows the system's FULL POTENTIAL: the COMPLETE,
    correctly demo-scoped Realistic Scale catalog (150-SKU product graph, competitor
    index, pricing recommendations, KVI watchlist, margin targets, substitutes),
    populated with zero clicks.

    Idempotent: a fast no-op (two small COUNTs) once the showcase is complete and
    demo-scoped. If it's missing, INCOMPLETE, or mis-scoped — e.g. an old load left
    rows as 'user:legacy' / 'user:<hash>', which would wrongly surface in Live and
    starve Demo's pricing surfaces (the failure that left margin/KVI covering ~16
    SKUs instead of the full catalog) — it rebuilds cleanly: a bounded wipe of just
    the realistic-scale rows, a fresh load, and a pricing-engine run (recommendations
    are engine output, not seed rows). ~8s one-time, then a no-op. Returns True if it
    rebuilt.
    """
    from app.models import PricingRecommendation, ProductCost
    from app.scenarios.realistic_scale import CATALOG, load_realistic_scale
    from app.scope import DEMO_REALISTIC_SCALE

    rs_skus = [c.sku for c in CATALOG]
    batch_present = db.scalar(
        select(PriceBatch.id).where(PriceBatch.external_id == REALISTIC_SCALE_EXTERNAL_ID)
    )
    demo_costs = db.scalar(
        select(func.count())
        .select_from(ProductCost)
        .where(ProductCost.sku.in_(rs_skus), ProductCost.source_run_id == DEMO_REALISTIC_SCALE)
    )
    demo_recs = db.scalar(
        select(func.count())
        .select_from(PricingRecommendation)
        .where(PricingRecommendation.source_run_id == DEMO_REALISTIC_SCALE)
    )
    # Complete = catalog batch present, (almost) every SKU has a demo-scoped cost,
    # and the engine has produced recommendations. The 0.9 factor tolerates minor
    # catalog drift without forcing an unnecessary rebuild.
    if batch_present and demo_costs >= int(len(rs_skus) * 0.9) and demo_recs > 0:
        return False
    _wipe_realistic_scale(db)
    load_realistic_scale(db)  # entities, links, costs, history, competitor obs, catalog batch
    try:
        from app.pricing.pipeline import run_pricing_engine

        run_pricing_engine(db)  # recommendations are engine output, not loader rows
    except Exception:
        logger.exception("Realistic Scale pricing-engine run skipped")
    return True
