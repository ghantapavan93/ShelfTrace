"""Smart product matching: links competitor products to canonical entities using similarity rules."""
from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CompetitorProduct, CompetitorProductEntity, ProductEntity
from app.services.product_graph import title_similarity


@dataclass
class MatchResult:
    """Result of matching a competitor product to an entity."""

    entity: ProductEntity
    score: float  # 0..1
    reason: str  # why did we match


def normalize_title(title: str) -> str:
    """Lowercase, strip extra whitespace, remove common suffixes."""
    title = title.lower().strip()
    # Remove size units that commonly vary (organic, free-range, etc. are kept)
    title = re.sub(r'\s+(pack|count|qty|units?|pack size|count pack).*', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s+\([^)]*\)$', '', title)  # strip trailing parens
    return title


def estimate_match_score(
    competitor_title: str,
    entity_title: str,
    competitor_category: str | None,
    entity_category: str | None,
    competitor_brand: str | None = None,
    entity_brand: str | None = None,
) -> float:
    """Heuristic match score (0..1) combining title similarity + category + brand.
    Real systems use learned embeddings."""
    # Normalize both titles
    comp_norm = normalize_title(competitor_title)
    ent_norm = normalize_title(entity_title)

    # Title similarity is the primary signal
    title_sim = title_similarity(comp_norm, ent_norm)

    # Category match (if both exist)
    category_bonus = 0.0
    if competitor_category and entity_category:
        if competitor_category.lower() in entity_category.lower() or entity_category.lower() in competitor_category.lower():
            category_bonus = 0.1

    # Brand match (if both exist)
    brand_bonus = 0.0
    if competitor_brand and entity_brand:
        if competitor_brand.lower() == entity_brand.lower():
            brand_bonus = 0.15

    final_score = min(1.0, title_sim + category_bonus + brand_bonus)
    return final_score


def find_best_match(db: Session, competitor_product: CompetitorProduct) -> MatchResult | None:
    """Find the best matching entity for a competitor product.
    Returns None if no match meets the threshold."""
    threshold = 0.70  # require 70% confidence

    # Get all entities
    entities = db.scalars(select(ProductEntity)).all()

    best_match = None
    best_score = 0.0

    for entity in entities:
        score = estimate_match_score(
            competitor_product.title,
            entity.canonical_title,
            competitor_product.category,
            entity.category_id,  # would need to fetch category.name for fair comparison
            competitor_brand=None,
            entity_brand=entity.brand,
        )

        if score > best_score:
            best_score = score
            best_match = entity

    if best_score < threshold:
        return None

    reason = f"title_sim={best_score:.2f}"
    return MatchResult(entity=best_match, score=best_score, reason=reason)


def bulk_match_competitors(db: Session, min_score: float = 0.70) -> tuple[int, int]:
    """Auto-match all unmatched competitor products to entities.
    Returns (matched_count, skipped_count)."""
    # Find all competitor products not yet linked to an entity
    matched_stmt = select(CompetitorProductEntity.competitor_product_id)
    matched_ids = set(db.scalars(matched_stmt).all())

    unmatched_stmt = select(CompetitorProduct).where(~CompetitorProduct.id.in_(matched_ids) if matched_ids else True)
    unmatched = db.scalars(unmatched_stmt).all()

    matched_count = 0
    skipped_count = 0

    for comp_product in unmatched:
        result = find_best_match(db, comp_product)
        if result and result.score >= min_score:
            link = CompetitorProductEntity(
                id=f"cpe_{comp_product.id[:8]}_{result.entity.id[:8]}",
                competitor_product_id=comp_product.id,
                entity_id=result.entity.id,
                match_score=result.score,
            )
            db.add(link)
            matched_count += 1
        else:
            skipped_count += 1

    db.commit()
    return matched_count, skipped_count
