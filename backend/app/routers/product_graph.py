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
    db: Session = Depends(get_db),
) -> dict:
    """List canonical product entities with optional filtering."""
    stmt = select(ProductEntity)
    count_stmt = select(func.count(ProductEntity.id))
    if brand:
        stmt = stmt.where(ProductEntity.brand == brand)
        count_stmt = count_stmt.where(ProductEntity.brand == brand)
    if category_id:
        stmt = stmt.where(ProductEntity.category_id == category_id)
        count_stmt = count_stmt.where(ProductEntity.category_id == category_id)

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
                "linked_sku_count": sku_counts.get(e.id, 0),
                "competitor_observation_count": obs_counts.get(e.id, 0),
                "created_at": e.created_at.isoformat(),
            }
            for e in rows
        ],
    }


@router.get("/entities/{entity_id}")
def get_entity(entity_id: str, db: Session = Depends(get_db)) -> dict:
    """Get a single entity and all linked SKUs + competitor products."""
    entity = db.scalar(select(ProductEntity).where(ProductEntity.id == entity_id))
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    # Get linked SKUs
    sku_links = db.scalars(select(SKUProductLink).where(SKUProductLink.entity_id == entity_id)).all()

    # Get competitor price observations
    price_obs = db.scalars(
        select(CompetitorPriceObservation).where(CompetitorPriceObservation.entity_id == entity_id)
    ).all()

    return {
        "entity": {
            "id": entity.id,
            "canonical_title": entity.canonical_title,
            "brand": entity.brand,
            "manufacturer": entity.manufacturer,
            "upc": entity.upc,
            "category_id": entity.category_id,
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
            }
            for link in sku_links
        ],
        "competitor_observations": [
            {
                "source": obs.competitor_product_id,
                "price": obs.price,
                "currency": obs.currency,
                "zone_id": obs.zone_id,
                "store_id": obs.store_id,
                "observed_at": obs.observed_at.isoformat(),
                "delta_pct": obs.delta_pct,
            }
            for obs in price_obs
        ],
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
        )
        db.add(obs)

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
