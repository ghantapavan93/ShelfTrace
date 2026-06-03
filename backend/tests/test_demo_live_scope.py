"""Demo = full potential, Live = clean slate.

Encodes the product intent for the two work modes:

  • DEMO mode shows the system's FULL POTENTIAL — the Realistic Scale catalog
    (150-SKU product graph, competitor index, pricing recommendations), all
    demo-scoped, populated with zero clicks.
  • LIVE mode is a TRUE CLEAN SLATE — only user-uploaded data; stray user/legacy
    rows are purged so a fresh Live surface is empty (bring-your-own-data).

Also guards the root-cause bug that originally put the showcase in the wrong
mode: a blanket NULL→'user:legacy' backfill mis-scoped the realistic-scale
ENTITIES, and db_migrate._reclassify_demo_rows must restore them to 'demo:'.
"""
from __future__ import annotations

from sqlalchemy import func, select, text

from app.database import engine
from app.db_migrate import _reclassify_demo_rows
from app.models import (
    HistoricalSale,
    PricingRecommendation,
    ProductEntity,
    SKUProductLink,
    utcnow,
)
from app.scenarios.realistic_scale import CATALOG
from app.scope import DEMO_REALISTIC_SCALE
from app.seed import ensure_realistic_scale_demo, purge_user_scope


def test_demo_full_potential_and_live_clean_slate(db):
    rs_skus = [c.sku for c in CATALOG]

    # 1. DEMO full potential: the catalog loads (demo-scoped) and the pricing
    #    engine generates recommendations — populated without any manual step.
    ensure_realistic_scale_demo(db)
    demo_entities = db.scalar(
        select(func.count()).select_from(ProductEntity).where(ProductEntity.source_run_id.like("demo:%"))
    )
    assert demo_entities >= 100, f"demo should show the full catalog, got {demo_entities}"
    demo_recs = db.scalar(
        select(func.count())
        .select_from(PricingRecommendation)
        .where(PricingRecommendation.source_run_id == DEMO_REALISTIC_SCALE)
    )
    assert demo_recs > 0, "the pricing engine should have produced demo recommendations"

    # 2. Reclassify restores any mis-scoped realistic-scale rows to demo: — the
    #    original bug stamped the entities/links 'user:legacy' (wrongly surfacing
    #    them in Live and hiding them from Demo).
    db.execute(text("UPDATE product_entities SET source_run_id='user:legacy' WHERE source_run_id=:s"), {"s": DEMO_REALISTIC_SCALE})
    db.execute(text("UPDATE sku_product_links SET source_run_id='user:legacy' WHERE source_run_id=:s"), {"s": DEMO_REALISTIC_SCALE})
    db.commit()
    with engine.begin() as conn:
        _reclassify_demo_rows(conn)
    db.expire_all()
    misscoped = db.scalar(
        select(func.count())
        .select_from(SKUProductLink)
        .where(SKUProductLink.sku.in_(rs_skus), SKUProductLink.source_run_id != DEMO_REALISTIC_SCALE)
    )
    assert misscoped == 0, "reclassify must put every realistic-scale link back on the demo side"

    # 3. LIVE clean slate: stray user-scoped data is purged; demo showcase survives.
    db.add(
        HistoricalSale(
            id="hs_user_junk", sku="junk-sku", store_id="s9",
            date=utcnow(), price=1.0, units_sold=1, source_run_id="user:test",
        )
    )
    db.commit()
    purge_user_scope(db)
    db.expire_all()
    user_left = db.scalar(
        select(func.count()).select_from(HistoricalSale).where(HistoricalSale.source_run_id.like("user:%"))
    )
    assert user_left == 0, "Live must be a clean slate — no user-scoped rows remain"
    demo_after = db.scalar(
        select(func.count()).select_from(ProductEntity).where(ProductEntity.source_run_id.like("demo:%"))
    )
    assert demo_after >= 100, "the demo showcase must be preserved by the purge"


def test_purge_user_scope_is_idempotent_and_demo_safe(db):
    """A second purge is a no-op, and demo:* rows are never touched."""
    db.add(ProductEntity(id="e_demo_keep", canonical_title="Keep Me", source_run_id="demo:memorial-day"))
    db.add(ProductEntity(id="e_user_drop", canonical_title="Drop Me", source_run_id="user:legacy"))
    db.commit()

    first = purge_user_scope(db)
    assert first["product_entities"] >= 1
    db.expire_all()
    assert db.get(ProductEntity, "e_demo_keep") is not None
    assert db.get(ProductEntity, "e_user_drop") is None

    second = purge_user_scope(db)  # nothing left to purge
    assert all(v == 0 for v in second.values())
