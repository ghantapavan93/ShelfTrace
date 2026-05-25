"""Product knowledge graph API — queries and mutations on the cross-source graph."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    CompetitorPriceObservation,
    ProductCategory,
    ProductEntity,
    SKUProductLink,
)
from app.services import entity_matcher, product_graph

router = APIRouter(prefix="/product-graph", tags=["product-knowledge-graph"])


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
    if brand:
        stmt = stmt.where(ProductEntity.brand == brand)
    if category_id:
        stmt = stmt.where(ProductEntity.category_id == category_id)

    total = db.scalar(select(lambda: stmt.count()))
    rows = db.scalars(stmt.offset(skip).limit(limit)).all()

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
