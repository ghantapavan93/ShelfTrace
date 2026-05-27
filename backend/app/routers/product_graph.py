"""Product knowledge graph API — queries and mutations on the cross-source graph."""
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    ProductCategory,
    ProductEntity,
    SKUProductLink,
    utcnow,
)
from app.scope import DEMO_MEMORIAL_DAY, Scope, apply_filter, current_scope
from app.services import entity_matcher, product_graph

router = APIRouter(prefix="/api/v1/product-graph", tags=["product-knowledge-graph"])


# ──────────────────────────────────────────────────────────────────────
# Queries
# ──────────────────────────────────────────────────────────────────────


@router.get("/entities")
def list_entities(
    brand: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    scope: Optional[str] = Query(
        None,
        description="Data scope filter: 'live' (user uploads only), 'demo' (seeded only), 'all'. Default all.",
    ),
    db: Session = Depends(get_db),
) -> dict:
    """List canonical product entities with optional filtering.

    The `scope` query parameter is the authoritative Live/Demo boundary
    — when scope=live the result set excludes every demo-seeded entity
    via source_run_id filter, not via attribute heuristics.
    """
    resolved_scope = current_scope(scope)
    stmt = select(ProductEntity)
    count_stmt = select(func.count(ProductEntity.id))
    if brand:
        stmt = stmt.where(ProductEntity.brand == brand)
        count_stmt = count_stmt.where(ProductEntity.brand == brand)
    if category_id:
        stmt = stmt.where(ProductEntity.category_id == category_id)
        count_stmt = count_stmt.where(ProductEntity.category_id == category_id)
    # Backend data-scope filter — replaces the prior frontend-only filter
    stmt = apply_filter(stmt, ProductEntity.source_run_id, resolved_scope)
    count_stmt = apply_filter(count_stmt, ProductEntity.source_run_id, resolved_scope)

    total = db.scalar(count_stmt) or 0
    rows = db.scalars(stmt.offset(skip).limit(limit)).all()

    # Pre-fetch link counts for each entity in one query
    entity_ids = [e.id for e in rows]
    sku_counts: dict[str, int] = {}
    obs_counts: dict[str, int] = {}
    if entity_ids:
        sku_rows = db.execute(
            select(SKUProductLink.entity_id, func.count(SKUProductLink.id))
            .where(SKUProductLink.entity_id.in_(entity_ids))
            .group_by(SKUProductLink.entity_id)
        ).all()
        sku_counts = {row[0]: row[1] for row in sku_rows}

        obs_rows = db.execute(
            select(CompetitorPriceObservation.entity_id, func.count(CompetitorPriceObservation.id))
            .where(CompetitorPriceObservation.entity_id.in_(entity_ids))
            .group_by(CompetitorPriceObservation.entity_id)
        ).all()
        obs_counts = {row[0]: row[1] for row in obs_rows}

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "entities": [
            {
                "id": e.id,
                "canonical_title": e.canonical_title,
                "brand": e.brand,
                "manufacturer": e.manufacturer,
                "upc": e.upc,
                "category_id": e.category_id,
                "unit_size": e.unit_size,
                "attributes": e.attributes,
                "match_confidence": e.match_confidence,
                "is_manual": e.is_manual,
                "source_run_id": e.source_run_id,
                "linked_sku_count": sku_counts.get(e.id, 0),
                "competitor_observation_count": obs_counts.get(e.id, 0),
                "created_at": e.created_at.isoformat(),
            }
            for e in rows
        ],
    }


@router.get("/entities/{entity_id}")
def get_entity(entity_id: str, db: Session = Depends(get_db)) -> dict:
    """Get a single entity and all linked SKUs + competitor products.

    Each competitor observation is enriched with the per-signal match
    breakdown the matcher used to link the competitor product to this
    entity — title similarity, brand match, unit-size match, category
    match — so the UI can show "why did we trust this match?" without
    a second roundtrip.
    """
    entity = db.scalar(select(ProductEntity).where(ProductEntity.id == entity_id))
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    # Get linked SKUs
    sku_links = db.scalars(select(SKUProductLink).where(SKUProductLink.entity_id == entity_id)).all()

    # Get competitor price observations
    price_obs = list(
        db.scalars(
            select(CompetitorPriceObservation).where(CompetitorPriceObservation.entity_id == entity_id)
        )
    )

    # Bulk-fetch competitor products + their entity-match scores so we can
    # explain each edge. One query per join, not one per observation.
    cp_ids = list({obs.competitor_product_id for obs in price_obs})
    cp_by_id: dict[str, CompetitorProduct] = {}
    cpe_by_cp_id: dict[str, CompetitorProductEntity] = {}
    if cp_ids:
        for cp in db.scalars(select(CompetitorProduct).where(CompetitorProduct.id.in_(cp_ids))):
            cp_by_id[cp.id] = cp
        cpe_rows = db.scalars(
            select(CompetitorProductEntity)
            .where(CompetitorProductEntity.competitor_product_id.in_(cp_ids))
            .where(CompetitorProductEntity.entity_id == entity_id)
        )
        for cpe in cpe_rows:
            cpe_by_cp_id[cpe.competitor_product_id] = cpe

    # Category name for category-match comparison
    entity_category_name: str | None = None
    if entity.category_id:
        cat = db.scalar(select(ProductCategory).where(ProductCategory.id == entity.category_id))
        entity_category_name = cat.name if cat else None

    def _explain(cp: CompetitorProduct | None) -> dict:
        """Per-signal breakdown — same factors the matcher weighs."""
        if cp is None:
            return {
                "title_sim": None,
                "brand_match": None,
                "unit_size_match": None,
                "category_match": None,
            }
        title_sim = product_graph.title_similarity(
            entity_matcher.normalize_title(cp.title),
            entity_matcher.normalize_title(entity.canonical_title),
        )
        brand_match = bool(entity.brand and cp.title and entity.brand.lower() in cp.title.lower())
        unit_size_match = bool(
            entity.unit_size
            and cp.title
            and _unit_size_in_title(entity.unit_size, cp.title)
        )
        category_match = bool(
            entity_category_name
            and cp.category
            and (
                entity_category_name.lower() in cp.category.lower()
                or cp.category.lower() in entity_category_name.lower()
            )
        )
        return {
            "title_sim": round(title_sim, 3),
            "brand_match": brand_match,
            "unit_size_match": unit_size_match,
            "category_match": category_match,
        }

    return {
        "entity": {
            "id": entity.id,
            "canonical_title": entity.canonical_title,
            "brand": entity.brand,
            "manufacturer": entity.manufacturer,
            "upc": entity.upc,
            "category_id": entity.category_id,
            "category_name": entity_category_name,
            "unit_size": entity.unit_size,
            "attributes": entity.attributes,
            "match_confidence": entity.match_confidence,
            "is_manual": entity.is_manual,
            "created_at": entity.created_at.isoformat(),
        },
        "linked_skus": [
            {
                "sku": link.sku,
                "zone_id": link.zone_id,
                "linked_at": link.linked_at.isoformat(),
                "current_price": _latest_action_price_for_sku(db, link.sku),
            }
            for link in sku_links
        ],
        "competitor_observations": [
            {
                "source": obs.competitor_product_id,
                "source_id": (cp_by_id.get(obs.competitor_product_id).source_id
                              if cp_by_id.get(obs.competitor_product_id) else None),
                "competitor_title": (cp_by_id.get(obs.competitor_product_id).title
                                     if cp_by_id.get(obs.competitor_product_id) else None),
                "competitor_category": (cp_by_id.get(obs.competitor_product_id).category
                                        if cp_by_id.get(obs.competitor_product_id) else None),
                "price": obs.price,
                "currency": obs.currency,
                "zone_id": obs.zone_id,
                "store_id": obs.store_id,
                "observed_at": obs.observed_at.isoformat(),
                "delta_pct": obs.delta_pct,
                "match_score": (cpe_by_cp_id.get(obs.competitor_product_id).match_score
                                if cpe_by_cp_id.get(obs.competitor_product_id) else None),
                "match_signals": _explain(cp_by_id.get(obs.competitor_product_id)),
            }
            for obs in price_obs
        ],
    }


def _latest_action_price_for_sku(db: Session, sku: str) -> float | None:
    """Latest approved price across all stores for this SKU, or None."""
    from app.models import PriceAction
    row = db.scalar(
        select(PriceAction)
        .where(PriceAction.sku == sku)
        .order_by(PriceAction.id.desc())
    )
    return row.approved_price if row else None


def _unit_size_in_title(unit_size: str, title: str) -> bool:
    """True if the entity's unit-size token (e.g. '12-count', '1 lb', '52 oz')
    appears in the competitor title in a tolerant form. We compare lowercased
    tokens and treat hyphens/spaces as interchangeable so '12-count' matches
    '12 count' or '12ct'."""
    if not unit_size or not title:
        return False
    t = title.lower()
    u = unit_size.lower().replace("-", " ").strip()
    if u in t:
        return True
    # Compact form: '12 count' → '12ct', '1 lb' → '1lb'
    compact = u.replace(" ", "")
    if compact in t.replace(" ", "").replace("-", ""):
        return True
    # First numeric token of the unit size (e.g. '12') alongside a keyword
    parts = u.split()
    if parts and parts[0].isdigit() and parts[0] in t:
        keyword = parts[1] if len(parts) > 1 else ""
        if keyword and (keyword in t or keyword[:2] in t):
            return True
    return False


@router.get("/entities/{entity_id}/substitutes")
def get_substitutes(entity_id: str, db: Session = Depends(get_db)) -> dict:
    """Find products that compete with or complement this entity.

    Calls the cannibalization heuristic: products in the same (or adjacent)
    category with non-zero estimated cross-elasticity. Positive cross-
    elasticity → substitute (raising A's price lifts B's demand); negative
    → complement (often purchased together). Returns ranked by absolute
    magnitude so the strongest relationships surface first.

    Real systems use learned embeddings on basket co-purchase data; this
    is a heuristic that produces a usable ranking from the price-history
    we already collect.
    """
    from app.pricing.cannibalization import find_substitute_products

    entity = db.scalar(select(ProductEntity).where(ProductEntity.id == entity_id))
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    subs = find_substitute_products(db, entity_id, same_category_only=False)

    # Pre-fetch category names so the UI can render "Dairy & Eggs" not "cat_42"
    cat_ids = {s.category_id for s in subs if s.category_id} | (
        {entity.category_id} if entity.category_id else set()
    )
    cat_names: dict[str, str] = {}
    if cat_ids:
        for c in db.scalars(select(ProductCategory).where(ProductCategory.id.in_(cat_ids))):
            cat_names[c.id] = c.name

    def _kind(xelast: float) -> str:
        if xelast > 0.15:
            return "substitute"
        if xelast < -0.15:
            return "complement"
        if xelast > 0.05:
            return "weak_substitute"
        if xelast < -0.05:
            return "weak_complement"
        return "unrelated"

    return {
        "entity": {
            "id": entity.id,
            "canonical_title": entity.canonical_title,
            "category_id": entity.category_id,
            "category_name": cat_names.get(entity.category_id) if entity.category_id else None,
        },
        "substitutes": [
            {
                "entity_id": s.entity_id,
                "canonical_title": s.canonical_title,
                "category_id": s.category_id,
                "category_name": cat_names.get(s.category_id) if s.category_id else None,
                "estimated_cross_elasticity": round(s.estimated_cross_elasticity, 3),
                "confidence": round(s.confidence, 2),
                "kind": _kind(s.estimated_cross_elasticity),
                "same_category": s.category_id == entity.category_id,
            }
            for s in subs
        ],
        "note": (
            "Cross-elasticity is estimated from co-movement in price history. "
            "|ε| > 0.15 is treated as a strong relationship. Real-world systems "
            "augment this with basket co-purchase signals and learned embeddings."
        ),
    }


@router.get("/sku/{sku}/entity")
def resolve_sku_to_entity(sku: str, zone_id: Optional[str] = None, db: Session = Depends(get_db)) -> dict:
    """Resolve a SKU to its canonical entity."""
    entity = product_graph.get_entity_for_sku(db, sku, zone_id)
    if not entity:
        raise HTTPException(status_code=404, detail=f"No entity found for SKU {sku}")

    return {
        "sku": sku,
        "zone_id": zone_id,
        "entity_id": entity.id,
        "canonical_title": entity.canonical_title,
        "brand": entity.brand,
    }


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)) -> dict:
    """List all product categories."""
    roots = db.scalars(select(ProductCategory).where(ProductCategory.parent_id == None)).all()  # noqa: E712

    def category_tree(cat: ProductCategory) -> dict:
        children = db.scalars(select(ProductCategory).where(ProductCategory.parent_id == cat.id)).all()
        return {
            "id": cat.id,
            "name": cat.name,
            "description": cat.description,
            "children": [category_tree(child) for child in children],
        }

    return {"categories": [category_tree(root) for root in roots]}


# ──────────────────────────────────────────────────────────────────────
# Mutations
# ──────────────────────────────────────────────────────────────────────


@router.post("/entities")
def create_entity(
    body: dict,
    db: Session = Depends(get_db),
) -> dict:
    """Create a new canonical product entity."""
    entity = product_graph.create_product_entity(
        db=db,
        canonical_title=body.get("canonical_title"),
        category_id=body.get("category_id"),
        brand=body.get("brand"),
        manufacturer=body.get("manufacturer"),
        upc=body.get("upc"),
        unit_size=body.get("unit_size"),
        attributes=body.get("attributes"),
        is_manual=body.get("is_manual", False),
    )
    db.commit()
    return {"id": entity.id, "canonical_title": entity.canonical_title}


@router.post("/bulk-match")
def trigger_bulk_match(min_score: float = Query(0.70, ge=0.0, le=1.0), db: Session = Depends(get_db)) -> dict:
    """Automatically match all unmatched competitor products to entities."""
    matched, skipped = entity_matcher.bulk_match_competitors(db, min_score=min_score)
    return {
        "matched_count": matched,
        "skipped_count": skipped,
        "min_score": min_score,
    }


@router.post("/bootstrap-from-scenario", status_code=201)
def bootstrap_from_scenario(body: dict, db: Session = Depends(get_db)) -> dict:
    """Auto-create entities + synthetic competitor observations for each SKU in
    a scenario's action list.

    Accepts: {"actions": [{"sku": "...", "product_name": "...",
                            "approved_price": 4.19, "category": "..." (optional)}, ...],
              "zone_id": "..." (optional)}

    For each unknown SKU:
      1. Create a ProductEntity with canonical_title = product_name
      2. Link the SKU to the entity (SKUProductLink, zone-scoped if provided)
      3. Create 2 synthetic CompetitorProduct rows (whole_foods_demo +
         amazon_fresh_demo) priced at ±5% of approved_price
      4. Link competitors → entity (CompetitorProductEntity)
      5. Persist CompetitorPriceObservation rows so the hints populate

    Idempotent: SKUs already linked to an entity are skipped.
    """
    actions = body.get("actions") or []
    zone_id = body.get("zone_id") or None
    if not isinstance(actions, list) or not actions:
        raise HTTPException(status_code=422, detail="actions list is required")

    now = utcnow()
    bootstrapped = 0
    skipped_existing = 0
    skipped_invalid = 0
    created_observations = 0

    for action in actions:
        sku = (action.get("sku") or "").strip()
        product_name = (action.get("product_name") or "").strip()
        approved_price = action.get("approved_price")
        category_name = action.get("category")

        if not sku or not product_name or not approved_price or approved_price <= 0:
            skipped_invalid += 1
            continue

        # Skip if already linked
        existing_link = db.scalar(
            select(SKUProductLink).where(SKUProductLink.sku == sku)
        )
        if existing_link:
            skipped_existing += 1
            continue

        # Resolve/create category
        category_id = None
        if category_name:
            cat = product_graph.find_or_create_category(db, category_name)
            db.flush()
            category_id = cat.id

        # Create entity
        entity = product_graph.create_product_entity(
            db=db,
            canonical_title=product_name,
            category_id=category_id,
            brand=None,
            attributes={"bootstrapped_from_scenario": True},
            is_manual=False,
        )

        # Link SKU
        product_graph.link_sku_to_entity(db, sku, entity.id, zone_id=zone_id)

        # Synthetic competitor observations at ±5% of approved_price
        # whole_foods_demo: +5% (premium)
        # amazon_fresh_demo: -2% (slightly cheaper)
        for source_id, delta_pct in (("whole_foods_demo", 5.0), ("amazon_fresh_demo", -2.0)):
            price = round(approved_price * (1 + delta_pct / 100), 2)
            cp_id = f"cp_{uuid.uuid4().hex[:12]}"
            ext_id = f"{source_id}_{sku[:32]}"
            cp = CompetitorProduct(
                id=cp_id,
                source_id=source_id,
                external_id=ext_id,
                stable_key=f"{source_id}:{ext_id}",
                title=product_name,
                price=price,
                currency="USD",
                category=category_name,
                availability="in_stock",
                raw_attributes={"bootstrapped": True},
            )
            db.add(cp)
            # Force CompetitorProduct INSERT before any FK referrers below.
            # Postgres enforces immediate FK constraints; without this flush
            # SQLAlchemy's reordering can put the observation INSERT first
            # and trip a ForeignKeyViolation. SQLite tolerates it.
            db.flush()

            cpe = CompetitorProductEntity(
                id=f"cpe_{uuid.uuid4().hex[:12]}",
                competitor_product_id=cp_id,
                entity_id=entity.id,
                match_score=1.0,
            )
            db.add(cpe)

            obs = CompetitorPriceObservation(
                id=f"obs_{uuid.uuid4().hex[:12]}",
                competitor_product_id=cp_id,
                entity_id=entity.id,
                price=price,
                currency="USD",
                zone_id=zone_id,
                store_id=None,
                observed_at=now,
                delta_pct=delta_pct,
            )
            db.add(obs)
            created_observations += 1

        bootstrapped += 1

    db.commit()

    return {
        "bootstrapped_entities": bootstrapped,
        "skipped_already_linked": skipped_existing,
        "skipped_invalid_input": skipped_invalid,
        "competitor_observations_created": created_observations,
        "note": (
            f"Created {bootstrapped} canonical entities with synthetic competitor "
            f"observations (whole_foods_demo +5%, amazon_fresh_demo -2%). "
            "Refresh the scenario page to see hint pills populate."
        ),
    }


# ──────────────────────────────────────────────────────────────────────
# Demo seed — populate the graph with Memorial Day demo entities so the
# UI has something to show right after first boot.
# ──────────────────────────────────────────────────────────────────────


@router.post("/seed-demo", status_code=201)
def seed_demo_graph(db: Session = Depends(get_db)) -> dict:
    """Seed the knowledge graph with Memorial Day demo entities.

    Idempotent — no-op if the canonical entities already exist. Creates:
      • 3 categories (Dairy & Eggs, Produce, Beverages)
      • 3 canonical entities (eggs, strawberries, OJ) matching scenario SKUs
      • SKU links to internal SKUs used in the Memorial Day scenario
      • Synthetic competitor observations from each demo source

    After seeding, the /product-graph UI shows a populated cross-source graph
    and scenarios can resolve their SKUs to entities for cross-source lookups.
    """
    existing = db.scalar(select(ProductEntity).where(ProductEntity.canonical_title == "Cage-Free Large Brown Eggs"))
    if existing:
        return {
            "seeded": False,
            "note": "Memorial Day knowledge graph already seeded.",
        }

    # Categories
    dairy = product_graph.find_or_create_category(db, "Dairy & Eggs")
    produce = product_graph.find_or_create_category(db, "Produce")
    beverages = product_graph.find_or_create_category(db, "Beverages")
    db.flush()

    # Canonical entities (one per demo product)
    eggs = product_graph.create_product_entity(
        db,
        canonical_title="Cage-Free Large Brown Eggs",
        category_id=dairy.id,
        brand="Demo Farms",
        unit_size="12-count",
        attributes={"organic": False, "cage_free": True, "size": "large"},
        is_manual=True,
    )
    strawberries = product_graph.create_product_entity(
        db,
        canonical_title="Fresh Strawberries",
        category_id=produce.id,
        brand="Local Berry Co",
        unit_size="1 lb",
        attributes={"organic": False, "perishable": True},
        is_manual=True,
    )
    oj = product_graph.create_product_entity(
        db,
        canonical_title="Premium Not-From-Concentrate Orange Juice",
        category_id=beverages.id,
        brand="Sunshine Grove",
        unit_size="52 oz",
        attributes={"organic": False, "pulp": "low"},
        is_manual=True,
    )

    # Link internal scenario SKUs to entities
    product_graph.link_sku_to_entity(db, "egg-cage-free-brown-12", eggs.id, zone_id="Dallas Zone 2")
    product_graph.link_sku_to_entity(db, "strawberry-1lb", strawberries.id, zone_id="Dallas Zone 2")
    product_graph.link_sku_to_entity(db, "oj-nfc-premium-52oz", oj.id, zone_id="Dallas Zone 2")

    # Synthetic competitor products from the demo sources
    now = utcnow()
    synthetic = [
        # entity, source, price, delta_pct
        (eggs, "whole_foods_demo", 4.49, 7.2),
        (eggs, "amazon_fresh_demo", 4.29, 2.4),
        (strawberries, "whole_foods_demo", 5.99, 20.0),
        (strawberries, "amazon_fresh_demo", 4.99, 0.0),
        (oj, "whole_foods_demo", 9.99, 5.3),
        (oj, "amazon_fresh_demo", 8.99, -4.3),
    ]

    for entity, source_id, price, delta_pct in synthetic:
        cp_id = f"cp_{uuid.uuid4().hex[:12]}"
        ext_id = f"{source_id}_{entity.id[:8]}"
        cp = CompetitorProduct(
            id=cp_id,
            source_id=source_id,
            external_id=ext_id,
            stable_key=f"{source_id}:{ext_id}",
            title=entity.canonical_title,
            price=price,
            currency="USD",
            category=entity.category_id,
            availability="in_stock",
            raw_attributes={},
        )
        db.add(cp)
        # See bootstrap-from-scenario comment: Postgres needs the parent
        # CompetitorProduct INSERT to land before its FK referrers.
        db.flush()

        cpe = CompetitorProductEntity(
            id=f"cpe_{uuid.uuid4().hex[:12]}",
            competitor_product_id=cp_id,
            entity_id=entity.id,
            match_score=0.95,
        )
        db.add(cpe)

        obs = CompetitorPriceObservation(
            id=f"obs_{uuid.uuid4().hex[:12]}",
            competitor_product_id=cp_id,
            entity_id=entity.id,
            price=price,
            currency="USD",
            zone_id="Dallas Zone 2",
            store_id=None,
            observed_at=now - timedelta(hours=2),
            delta_pct=delta_pct,
            source_run_id=DEMO_MEMORIAL_DAY,
        )
        db.add(obs)

    # Stamp source_run_id on every row this seeder created so the Live
    # mode backend filter (source_run_id LIKE 'user:%') hides them.
    for ent in (eggs, strawberries, oj):
        ent.source_run_id = DEMO_MEMORIAL_DAY
    for link in db.scalars(
        select(SKUProductLink).where(
            SKUProductLink.entity_id.in_([eggs.id, strawberries.id, oj.id])
        )
    ):
        link.source_run_id = DEMO_MEMORIAL_DAY

    db.commit()

    return {
        "seeded": True,
        "categories": 3,
        "entities": 3,
        "sku_links": 3,
        "competitor_products": len(synthetic),
        "observations": len(synthetic),
        "note": "Memorial Day knowledge graph seeded — open /product-graph to view.",
    }


@router.get("/sku/{sku}/competitor-prices")
def get_competitor_prices_for_sku(sku: str, db: Session = Depends(get_db)) -> dict:
    """Get recent competitor prices for an internal SKU (via entity linkage).

    Returns the latest observation per source. Used by the Scenarios builder
    to show competitor reference prices alongside each action.
    """
    entity = product_graph.get_entity_for_sku(db, sku)
    if not entity:
        return {"sku": sku, "entity_id": None, "observations": []}

    observations = product_graph.get_competitor_prices_for_entity(db, entity.id)

    # Get source name for each observation via competitor_product lookup
    cp_ids = [o.competitor_product_id for o in observations]
    sources_by_cp = {}
    if cp_ids:
        cp_rows = db.execute(
            select(CompetitorProduct.id, CompetitorProduct.source_id, CompetitorProduct.title)
            .where(CompetitorProduct.id.in_(cp_ids))
        ).all()
        sources_by_cp = {row[0]: {"source_id": row[1], "title": row[2]} for row in cp_rows}

    return {
        "sku": sku,
        "entity_id": entity.id,
        "canonical_title": entity.canonical_title,
        "observations": [
            {
                "source_id": sources_by_cp.get(o.competitor_product_id, {}).get("source_id", "unknown"),
                "competitor_title": sources_by_cp.get(o.competitor_product_id, {}).get("title", ""),
                "price": o.price,
                "currency": o.currency,
                "delta_pct": o.delta_pct,
                "observed_at": o.observed_at.isoformat(),
            }
            for o in sorted(observations, key=lambda x: x.observed_at, reverse=True)
        ],
    }
