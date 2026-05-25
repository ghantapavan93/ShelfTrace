"""Add cross-source product knowledge graph: ProductEntity, ProductCategory, SKUProductLink, CompetitorPriceObservation.

Revision ID: 0003_product_knowledge_graph
Revises: 0002_jsonb_and_backoff
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_product_knowledge_graph"
down_revision: Union[str, None] = "0002_jsonb_and_backoff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # product_categories: hierarchical categories (parent_id=NULL for roots)
    op.create_table(
        "product_categories",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("parent_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["product_categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_product_categories_name", "product_categories", ["name"])
    op.create_index("ix_product_categories_parent_id", "product_categories", ["parent_id"])

    # product_entities: canonical product (unifies across sources)
    op.create_table(
        "product_entities",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("canonical_title", sa.String(length=256), nullable=False),
        sa.Column("category_id", sa.String(), nullable=True),
        sa.Column("brand", sa.String(length=128), nullable=True),
        sa.Column("manufacturer", sa.String(length=128), nullable=True),
        sa.Column("upc", sa.String(length=20), nullable=True),
        sa.Column("unit_size", sa.String(length=64), nullable=True),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("match_confidence", sa.Float(), nullable=False),
        sa.Column("is_manual", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["product_categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("upc"),
    )
    op.create_index("ix_product_entities_canonical_title", "product_entities", ["canonical_title"])
    op.create_index("ix_product_entities_category_id", "product_entities", ["category_id"])
    op.create_index("ix_product_entities_brand", "product_entities", ["brand"])
    op.create_index("ix_product_entities_upc", "product_entities", ["upc"])

    # competitor_product_entities: junction (competitor_product → entity)
    op.create_table(
        "competitor_product_entities",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("competitor_product_id", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("match_score", sa.Float(), nullable=False),
        sa.Column("matched_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["competitor_product_id"], ["competitor_products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["product_entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("competitor_product_id", "entity_id", name="uq_competitor_entity"),
    )
    op.create_index("ix_competitor_product_entities_competitor_product_id", "competitor_product_entities", ["competitor_product_id"])
    op.create_index("ix_competitor_product_entities_entity_id", "competitor_product_entities", ["entity_id"])

    # sku_product_links: junction (SKU → entity)
    op.create_table(
        "sku_product_links",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("sku", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("zone_id", sa.String(), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["entity_id"], ["product_entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", "entity_id", name="uq_sku_entity"),
    )
    op.create_index("ix_sku_product_links_sku", "sku_product_links", ["sku"])
    op.create_index("ix_sku_product_links_entity_id", "sku_product_links", ["entity_id"])
    op.create_index("ix_sku_product_links_zone_id", "sku_product_links", ["zone_id"])

    # competitor_price_observations: enhanced history with entity linkage
    op.create_table(
        "competitor_price_observations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("competitor_product_id", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("zone_id", sa.String(), nullable=True),
        sa.Column("store_id", sa.String(), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delta_pct", sa.Float(), nullable=True),
        sa.Column("scrape_run_id", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["competitor_product_id"], ["competitor_products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["product_entities.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_competitor_price_observations_competitor_product_id", "competitor_price_observations", ["competitor_product_id"])
    op.create_index("ix_competitor_price_observations_entity_id", "competitor_price_observations", ["entity_id"])
    op.create_index("ix_competitor_price_observations_observed_at", "competitor_price_observations", ["observed_at"])
    op.create_index("ix_competitor_price_observations_zone_id", "competitor_price_observations", ["zone_id"])


def downgrade() -> None:
    op.drop_index("ix_competitor_price_observations_zone_id", "competitor_price_observations")
    op.drop_index("ix_competitor_price_observations_observed_at", "competitor_price_observations")
    op.drop_index("ix_competitor_price_observations_entity_id", "competitor_price_observations")
    op.drop_index("ix_competitor_price_observations_competitor_product_id", "competitor_price_observations")
    op.drop_table("competitor_price_observations")

    op.drop_index("ix_sku_product_links_zone_id", "sku_product_links")
    op.drop_index("ix_sku_product_links_entity_id", "sku_product_links")
    op.drop_index("ix_sku_product_links_sku", "sku_product_links")
    op.drop_table("sku_product_links")

    op.drop_index("ix_competitor_product_entities_entity_id", "competitor_product_entities")
    op.drop_index("ix_competitor_product_entities_competitor_product_id", "competitor_product_entities")
    op.drop_table("competitor_product_entities")

    op.drop_index("ix_product_entities_upc", "product_entities")
    op.drop_index("ix_product_entities_brand", "product_entities")
    op.drop_index("ix_product_entities_category_id", "product_entities")
    op.drop_index("ix_product_entities_canonical_title", "product_entities")
    op.drop_table("product_entities")

    op.drop_index("ix_product_categories_parent_id", "product_categories")
    op.drop_index("ix_product_categories_name", "product_categories")
    op.drop_table("product_categories")
