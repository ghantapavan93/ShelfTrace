"""Tests for cross-source product knowledge graph."""
from __future__ import annotations

import pytest

from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    HistoricalSale,
    ProductCategory,
    ProductEntity,
    SKUProductLink,
    utcnow,
)
from app.services import entity_matcher, product_graph


def test_create_category_and_hierarchy(db):
    """Test hierarchical product categories."""
    beverages = product_graph.find_or_create_category(db, "Beverages")
    assert beverages.name == "Beverages"
    assert beverages.parent_id is None

    # Create a subcategory
    juices = product_graph.find_or_create_category(db, "Juices", parent_id=beverages.id)
    assert juices.parent_id == beverages.id

    # Retrieve (idempotent)
    beverages2 = product_graph.find_or_create_category(db, "Beverages")
    assert beverages2.id == beverages.id


def test_create_product_entity(db):
    """Create a canonical product entity."""
    entity = product_graph.create_product_entity(
        db=db,
        canonical_title="Organic Large Eggs, 12-pack",
        brand="Happy Hens",
        manufacturer="Farm Co",
        unit_size="12-pack",
        attributes={"organic": True, "size": "large"},
        is_manual=True,
    )
    assert entity.canonical_title == "Organic Large Eggs, 12-pack"
    assert entity.brand == "Happy Hens"
    assert entity.is_manual is True
    assert entity.attributes["organic"] is True


def test_link_sku_to_entity(db):
    """Link internal SKUs to canonical entities."""
    entity = product_graph.create_product_entity(db=db, canonical_title="Test Product")

    link = product_graph.link_sku_to_entity(db, sku="sku_12345", entity_id=entity.id, zone_id="dallas-02")
    assert link.sku == "sku_12345"
    assert link.entity_id == entity.id
    assert link.zone_id == "dallas-02"

    # Resolve SKU back to entity
    resolved = product_graph.get_entity_for_sku(db, "sku_12345", zone_id="dallas-02")
    assert resolved.id == entity.id


def test_resolve_sku_without_zone(db):
    """SKU can be resolved without zone scope if only one link exists."""
    entity = product_graph.create_product_entity(db=db, canonical_title="Global Product")
    product_graph.link_sku_to_entity(db, sku="sku_global", entity_id=entity.id, zone_id=None)

    # Can resolve without specifying zone
    resolved = product_graph.get_entity_for_sku(db, "sku_global")
    assert resolved.id == entity.id


def test_title_similarity_score(db):
    """Title similarity should be high for near-identical strings."""
    sim_exact = product_graph.title_similarity("Organic Eggs", "Organic Eggs")
    assert sim_exact > 0.95

    sim_partial = product_graph.title_similarity("Organic Eggs 12-pack", "Organic Eggs")
    assert sim_partial > 0.70

    sim_low = product_graph.title_similarity("Eggs", "Milk")
    assert sim_low < 0.30


def test_estimate_match_score(db):
    """Entity matching combines title + category + brand signals."""
    score_high = entity_matcher.estimate_match_score(
        competitor_title="Organic Large Eggs",
        entity_title="Organic Large Eggs",
        competitor_category="Dairy",
        entity_category="Dairy",
        competitor_brand=None,
        entity_brand="Farm Fresh",
    )
    assert score_high > 0.85

    score_low = entity_matcher.estimate_match_score(
        competitor_title="Whole Milk",
        entity_title="Orange Juice",
        competitor_category="Dairy",
        entity_category="Beverages",
    )
    assert score_low < 0.40


def test_auto_match_competitor_to_entity(db):
    """Auto-match finds best-fitting entity for a competitor product."""
    # Create target entity
    entity = product_graph.create_product_entity(
        db=db,
        canonical_title="Organic Eggs",
        category_id=None,
        brand="Happy Hens",
    )

    # Create competitor product that should match
    comp = CompetitorProduct(
        id="cp_1",
        source_id="whole_foods",
        external_id="wf_eggs_123",
        stable_key="whole_foods:wf_eggs_123",
        title="Organic Eggs Grade A",
        price=4.99,
        category="Dairy & Eggs",
    )
    db.add(comp)
    db.commit()

    result = entity_matcher.find_best_match(db, comp)
    assert result is not None
    assert result.entity.id == entity.id
    assert result.score > 0.70


def test_bulk_match_competitors(db):
    """Bulk matching links all unmatched competitor products to entities."""
    # Create entities
    eggs_entity = product_graph.create_product_entity(db=db, canonical_title="Organic Eggs")
    milk_entity = product_graph.create_product_entity(db=db, canonical_title="Whole Milk")

    # Create unmatched competitor products
    for i, (title, _sku) in enumerate([("Organic Eggs Grade A", "eggs"), ("Whole Milk 1L", "milk")]):
        comp = CompetitorProduct(
            id=f"cp_{i}",
            source_id="amazon_fresh",
            external_id=f"af_{i}",
            stable_key=f"amazon_fresh:af_{i}",
            title=title,
            price=5.00 + i,
        )
        db.add(comp)
    db.commit()

    # Run bulk match
    matched, skipped = entity_matcher.bulk_match_competitors(db, min_score=0.60)
    assert matched >= 1  # At least eggs should match


def test_competitor_price_observations(db):
    """Track competitor price observations linked to entities."""
    entity = product_graph.create_product_entity(db=db, canonical_title="Test Product")

    comp = CompetitorProduct(
        id="cp_obs_1",
        source_id="test_source",
        external_id="ext_123",
        stable_key="test_source:ext_123",
        title="Test Product",
        price=10.00,
    )
    db.add(comp)
    db.flush()  # parent competitor_products row must exist before the observation (PG enforces FKs; SQLite doesn't)

    obs = CompetitorPriceObservation(
        id="obs_1",
        competitor_product_id=comp.id,
        entity_id=entity.id,
        price=10.00,
        zone_id="zone_1",
        delta_pct=2.5,
    )
    db.add(obs)
    db.commit()

    # Retrieve observations for entity
    observations = product_graph.get_competitor_prices_for_entity(db, entity.id)
    assert len(observations) == 1
    assert observations[0].delta_pct == 2.5


def test_get_internal_history_for_entity(db):
    """Retrieve internal sales history for all SKUs linked to an entity."""
    entity = product_graph.create_product_entity(db=db, canonical_title="Historical Product")
    product_graph.link_sku_to_entity(db, sku="sku_hist", entity_id=entity.id)

    # Add sales history for that SKU
    for day in range(5):
        sale = HistoricalSale(
            id=f"sale_{day}",
            sku="sku_hist",
            store_id="store_1",
            date=utcnow(),
            price=10.00 + day,
            units_sold=100 - day * 10,
        )
        db.add(sale)
    db.commit()

    # Retrieve history
    history = product_graph.get_internal_history_for_entity(db, entity.id)
    assert len(history) == 5
    assert history[0].units_sold == 100


def test_no_history_for_unlinked_entity(db):
    """Entity with no linked SKUs has no internal history."""
    entity = product_graph.create_product_entity(db=db, canonical_title="Orphan Entity")
    history = product_graph.get_internal_history_for_entity(db, entity.id)
    assert history == []
