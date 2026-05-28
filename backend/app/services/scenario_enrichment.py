"""Scenario auto-enrichment — wire scraper, graph, and pricing engine to a
fresh scenario in a single call.

When a founder uploads their CSV and applies the rows, they shouldn't have
to navigate to /product-graph and /pricing separately to make the hint
pills populate. This service generates everything those downstream
surfaces need for the SKUs in the current scenario:

  1. ProductEntity rows (one per unique SKU) — canonical product nodes
  2. SKUProductLink rows — link the SKU to its entity (zone-scoped)
  3. CompetitorProduct + CompetitorProductEntity + CompetitorPriceObservation
     — synthetic observations from whole_foods_demo (+5%) and
     amazon_fresh_demo (-2%) so the 🌐 Competitor pill populates
  4. ProductCost rows — default cost = 62% of approved_price (38% margin
     baseline; the pricing engine respects category overrides on top)
  5. HistoricalSale rows — 30 days × store of synthetic POS data with
     realistic elasticity, weekly seasonality, and occasional promotions,
     so the engine has variance to fit a log-log regression against
  6. PricingRecommendation rows via run_pricing_engine() — so the 🧠
     Pricing rec pill populates

Idempotent at the SKU level: SKUs already linked to an entity are skipped;
SKUs that already have ProductCost are skipped; sales history is only
inserted if the SKU has fewer than 5 observations.

Honest about limits:
  • Synthetic data is clearly tagged ("bootstrapped_from_scenario": True
    on entity attributes; on_promotion flag on 5% of sales) so real POS
    data later supersedes it.
  • Competitor sources are the *_demo sources (no scraping against real
    retailer sites without authorization).
"""
from __future__ import annotations

import hashlib
import math
import uuid
from datetime import timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    HistoricalSale,
    ProductCost,
    ProductEntity,
    SKUProductLink,
    utcnow,
)
from app.pricing.pipeline import run_pricing_engine
from app.services import product_graph

# ── Knobs ────────────────────────────────────────────────────────────────
# History generation length. 30 days is enough to fit a stable elasticity
# given price rotation; staying short keeps the per-scenario footprint
# modest (a 10-SKU × 4-store scenario produces ~1,200 rows).
HISTORY_DAYS = 30

# Default cost ratio when the founder's CSV doesn't include it. 0.62 gives
# a 38% baseline margin which is in the range a grocer would defend.
DEFAULT_COST_RATIO = 0.62

# Competitor observation offsets — same as the bootstrap-from-scenario
# endpoint, kept consistent so the founder sees the same gap math.
COMPETITOR_OFFSETS = (("whole_foods_demo", 5.0), ("amazon_fresh_demo", -2.0))

# Default elasticity for synthetic histories. Mildly elastic so the engine
# produces real recommendations (β > -1 would have it raise prices to
# ceiling; β < -1 has it find an interior optimum).
DEFAULT_BETA = -1.4

# Number of distinct price points the synthetic POS data rotates through —
# the elasticity estimator needs price variance to fit a slope.
PRICE_LEVELS = 5


def _det_rng(seed: int):
    """Deterministic [0,1) pseudo-RNG — same SKU → same history across
    runs. Avoids the headache of Python's `random` global state."""
    state = seed & 0xFFFFFFFF
    def next_val() -> float:
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF
    return next_val


def auto_enrich_for_actions(
    db: Session,
    actions: list[dict],
    store_ids: list[str],
    zone_id: Optional[str] = None,
    source_run_id: Optional[str] = None,
) -> dict:
    """Enrich a scenario's SKUs across graph + pricing in one transaction.

    Args:
        actions: list of {"sku", "product_name", "approved_price"} dicts
        store_ids: stores the scenario targets (used for synthetic POS)
        zone_id: optional zone for SKU-graph linkage
        source_run_id: Live/Demo data-scope tag stamped on EVERY row this
            creates (entity, link, competitor observation, cost, sales). When
            omitted, falls back to a user-scope sentinel so the rows are never
            NULL — a NULL row reads as user:legacy under Scope.LIVE but is
            hidden by Scope.DEMO, which would split a single scenario's data
            across the boundary. Callers that know the scenario's scope
            (execute_live) should always pass it.

    Returns:
        A summary dict the API can echo back to the UI.
    """
    if not actions:
        return _empty_summary()

    # Never leave enrichment rows unscoped — pick a user-scope sentinel when
    # the caller didn't specify (e.g. pre-execution hint prefetch from the
    # scenario builder, where no batch/config scope exists yet).
    effective_source_run_id = source_run_id or "user:auto-enrich"

    now = utcnow()
    bootstrapped_entities = 0
    skipped_existing_entities = 0
    competitor_observations_created = 0
    costs_seeded = 0
    sales_seeded = 0

    # Default to at least one synthetic store if the founder hasn't filled
    # the scope yet — keeps the pricing engine able to produce something.
    effective_stores = store_ids or ["Store-A"]

    for action in actions:
        sku = (action.get("sku") or "").strip()
        product_name = (action.get("product_name") or "").strip()
        approved_price = action.get("approved_price")

        if not sku or not product_name or not approved_price or approved_price <= 0:
            continue

        # ── 1. Entity + SKU link ───────────────────────────────────────
        existing_link = db.scalar(select(SKUProductLink).where(SKUProductLink.sku == sku))
        if existing_link:
            entity_id = existing_link.entity_id
            skipped_existing_entities += 1
        else:
            entity = product_graph.create_product_entity(
                db=db,
                canonical_title=product_name,
                attributes={"bootstrapped_from_scenario": True},
                is_manual=False,
            )
            entity.source_run_id = effective_source_run_id
            link = product_graph.link_sku_to_entity(db, sku, entity.id, zone_id=zone_id)
            link.source_run_id = effective_source_run_id
            entity_id = entity.id
            bootstrapped_entities += 1

            # ── 2. Synthetic competitor observations ───────────────────
            # CompetitorProduct / CompetitorProductEntity have no
            # source_run_id column (they're source-keyed catalog rows, not
            # scenario-scoped); the OBSERVATION is the scenario-scoped fact,
            # so that's where the scope tag lives.
            for source_id, delta_pct in COMPETITOR_OFFSETS:
                price = round(approved_price * (1 + delta_pct / 100), 2)
                cp_id = f"cp_{uuid.uuid4().hex[:12]}"
                ext_id = f"{source_id}_{sku[:32]}"
                db.add(
                    CompetitorProduct(
                        id=cp_id,
                        source_id=source_id,
                        external_id=ext_id,
                        stable_key=f"{source_id}:{ext_id}",
                        title=product_name,
                        price=price,
                        currency="USD",
                        availability="in_stock",
                        raw_attributes={"bootstrapped": True},
                    ),
                )
                # Postgres enforces immediate FK constraints — flush the
                # CompetitorProduct INSERT before its FK referrers below.
                db.flush()
                db.add(
                    CompetitorProductEntity(
                        id=f"cpe_{uuid.uuid4().hex[:12]}",
                        competitor_product_id=cp_id,
                        entity_id=entity_id,
                        match_score=1.0,
                    ),
                )
                db.add(
                    CompetitorPriceObservation(
                        id=f"obs_{uuid.uuid4().hex[:12]}",
                        competitor_product_id=cp_id,
                        entity_id=entity_id,
                        price=price,
                        currency="USD",
                        zone_id=zone_id,
                        store_id=None,
                        observed_at=now,
                        delta_pct=delta_pct,
                        source_run_id=effective_source_run_id,
                    ),
                )
                competitor_observations_created += 1

        # ── 3. Product cost (default = 62% of approved_price) ─────────
        existing_cost = db.scalar(select(ProductCost).where(ProductCost.sku == sku))
        if not existing_cost:
            db.add(
                ProductCost(
                    id=f"cost_{uuid.uuid4().hex[:12]}",
                    sku=sku,
                    cost=round(approved_price * DEFAULT_COST_RATIO, 2),
                    source_run_id=effective_source_run_id,
                ),
            )
            costs_seeded += 1

        # ── 4. Synthetic historical sales (30d × stores) ──────────────
        existing_hist_count = db.scalar(
            select(func.count(HistoricalSale.id)).where(HistoricalSale.sku == sku)
        ) or 0
        if existing_hist_count < 5:
            # Deterministic RNG keyed on SKU so re-running yields the
            # same shape — easier to reason about for the founder.
            seed = int(hashlib.md5(sku.encode("utf-8")).hexdigest()[:8], 16)
            rng = _det_rng(seed)

            base_price = float(approved_price)
            # Price levels around the approved price (±10% in 2.5% steps).
            levels = [round(base_price * (1 + (i - PRICE_LEVELS // 2) * 0.025), 2) for i in range(PRICE_LEVELS)]
            beta = DEFAULT_BETA
            base_qty = 50 + (seed % 80)  # 50..130 base demand
            # Solve for A so Q(base_price) = base_qty.
            A = base_qty / (base_price ** beta)
            end = now.replace(hour=12, minute=0, second=0, microsecond=0)

            for store_id in effective_stores:
                store_offset = sum(ord(c) for c in store_id) % PRICE_LEVELS
                for d in range(HISTORY_DAYS):
                    day = end - timedelta(days=HISTORY_DAYS - d)
                    price = levels[(d + store_offset) % PRICE_LEVELS]
                    is_promo = rng() < 0.05
                    effective_price = price * 0.7 if is_promo else price
                    q_expected = A * (effective_price ** beta)
                    if day.weekday() >= 5:
                        q_expected *= 1.15
                    if is_promo:
                        q_expected *= 1.8
                    noise = math.exp((rng() - 0.5) * 0.2)
                    q = max(1, int(q_expected * noise))
                    db.add(
                        HistoricalSale(
                            id=f"hs_{uuid.uuid4().hex[:12]}",
                            sku=sku,
                            store_id=store_id,
                            date=day,
                            price=round(effective_price, 2),
                            units_sold=q,
                            on_promotion=is_promo,
                            source_run_id=effective_source_run_id,
                        ),
                    )
                    sales_seeded += 1

    db.commit()

    # ── 5. Run pricing engine over everything ─────────────────────────
    pricing = run_pricing_engine(db)

    return {
        "bootstrapped_entities": bootstrapped_entities,
        "skipped_existing_entities": skipped_existing_entities,
        "competitor_observations_created": competitor_observations_created,
        "product_costs_seeded": costs_seeded,
        "historical_sales_seeded": sales_seeded,
        "pricing_scanned": pricing.get("scanned", 0),
        "pricing_recommended": pricing.get("recommended", 0),
        "pricing_skipped": pricing.get("skipped", 0),
        "note": (
            f"Enriched {bootstrapped_entities} new entities ({skipped_existing_entities} already existed), "
            f"{competitor_observations_created} competitor observations, {costs_seeded} costs, "
            f"{sales_seeded} synthetic sales rows. Pricing engine produced "
            f"{pricing.get('recommended', 0)} recommendations across {pricing.get('scanned', 0)} SKU·stores."
        ),
    }


def _empty_summary() -> dict:
    return {
        "bootstrapped_entities": 0,
        "skipped_existing_entities": 0,
        "competitor_observations_created": 0,
        "product_costs_seeded": 0,
        "historical_sales_seeded": 0,
        "pricing_scanned": 0,
        "pricing_recommended": 0,
        "pricing_skipped": 0,
        "note": "No actions provided — nothing to enrich.",
    }
