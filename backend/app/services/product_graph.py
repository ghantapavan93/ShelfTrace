"""Product knowledge graph operations — entity matching, linkage, and normalization."""
from __future__ import annotations

from difflib import SequenceMatcher
from typing import Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    HistoricalSale,
    PriceAction,
    ProductCategory,
    ProductEntity,
    SKUProductLink,
)


def find_or_create_category(db: Session, category_name: str, parent_id: Optional[str] = None) -> ProductCategory:
    """Get existing category or create it. Useful for bootstrapping hierarchies."""
    stmt = select(ProductCategory).where(ProductCategory.name == category_name)
    existing = db.scalar(stmt)
    if existing:
        return existing

    cat = ProductCategory(id=f"cat_{category_name.lower().replace(' ', '_')}", name=category_name, parent_id=parent_id)
    db.add(cat)
    db.flush()
    return cat


def create_product_entity(
    db: Session,
    canonical_title: str,
    category_id: Optional[str] = None,
    brand: Optional[str] = None,
    manufacturer: Optional[str] = None,
    upc: Optional[str] = None,
    unit_size: Optional[str] = None,
    attributes: Optional[dict] = None,
    is_manual: bool = False,
) -> ProductEntity:
    """Create a canonical product entity (unifies across sources)."""
    import uuid

    entity = ProductEntity(
        id=f"pe_{uuid.uuid4().hex[:12]}",
        canonical_title=canonical_title,
        category_id=category_id,
        brand=brand,
        manufacturer=manufacturer,
        upc=upc,
        unit_size=unit_size,
        attributes=attributes or {},
        match_confidence=1.0 if is_manual else 0.0,
        is_manual=is_manual,
    )
    db.add(entity)
    db.flush()
    return entity


def title_similarity(title_a: str, title_b: str) -> float:
    """Simple title similarity score (0..1) via SequenceMatcher.
    Real systems use Levenshtein + phonetic matching."""
    return SequenceMatcher(None, title_a.lower(), title_b.lower()).ratio()


def auto_match_competitor_to_entity(
    db: Session, competitor_product: CompetitorProduct, min_score: float = 0.75
) -> Optional[ProductEntity]:
    """Try to find an existing entity matching this competitor product by title + category.
    Returns None if no good match found. Real systems would use ML ranking."""
    # Query entities with same or nearby category
    stmt = select(ProductEntity)
    if competitor_product.category:
        stmt = stmt.where(ProductEntity.category_id != None)  # noqa: E712

    candidates = db.scalars(stmt).all()

    best_entity = None
    best_score = 0.0

    for entity in candidates:
        sim = title_similarity(competitor_product.title, entity.canonical_title)
        if sim > best_score:
            best_score = sim
            best_entity = entity

    return best_entity if best_score >= min_score else None


def link_sku_to_entity(db: Session, sku: str, entity_id: str, zone_id: Optional[str] = None) -> SKUProductLink:
    """Link an internal SKU to a canonical entity. One SKU can link to one entity per zone."""
    import uuid

    link = SKUProductLink(
        id=f"skl_{uuid.uuid4().hex[:12]}",
        sku=sku,
        entity_id=entity_id,
        zone_id=zone_id,
    )
    db.add(link)
    db.flush()
    return link


def get_entity_for_sku(db: Session, sku: str, zone_id: Optional[str] = None) -> Optional[ProductEntity]:
    """Resolve a SKU to its canonical entity (zone-scoped if provided)."""
    stmt = select(SKUProductLink).where(SKUProductLink.sku == sku)
    if zone_id:
        stmt = stmt.where(or_(SKUProductLink.zone_id == zone_id, SKUProductLink.zone_id == None))

    link = db.scalar(stmt)
    if not link:
        return None

    return db.scalar(select(ProductEntity).where(ProductEntity.id == link.entity_id))


def get_competitor_prices_for_entity(db: Session, entity_id: str, zone_id: Optional[str] = None) -> list[CompetitorPriceObservation]:
    """Get all recent competitor price observations for a canonical entity.
    Useful for 'what are competitors charging for this product?'"""
    stmt = select(CompetitorPriceObservation).where(CompetitorPriceObservation.entity_id == entity_id)
    if zone_id:
        stmt = stmt.where(or_(CompetitorPriceObservation.zone_id == zone_id, CompetitorPriceObservation.zone_id == None))

    return db.scalars(stmt).all()


def get_internal_history_for_entity(db: Session, entity_id: str, store_id: Optional[str] = None) -> list[HistoricalSale]:
    """Get all internal sales history for products linked to an entity.
    Useful for elasticity estimation with competitor context."""
    # Find all SKUs linked to this entity
    stmt = select(SKUProductLink.sku).where(SKUProductLink.entity_id == entity_id)
    skus = [row[0] for row in db.execute(stmt).all()]

    if not skus:
        return []

    # Get sales history for those SKUs
    hist_stmt = select(HistoricalSale).where(HistoricalSale.sku.in_(skus))
    if store_id:
        hist_stmt = hist_stmt.where(HistoricalSale.store_id == store_id)

    return db.scalars(hist_stmt).all()
