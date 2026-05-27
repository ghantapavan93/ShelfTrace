"""Realistic Scale preset — production-shape demo catalog.

A serious scenario for reviewers who want to see what the platform looks
like when it isn't running on three hand-picked products. ~180 SKUs across
8 grocery categories with per-category elasticities pulled from published
retail-economics research, KVI flags matched to real industry traffic-
driver lists, and realistic competitor positioning across four illustrative
sources (Whole Foods, Amazon Fresh, Costco, Aldi).

Honesty rules — clearly labeled as illustrative throughout:
  • No real retailer logos / customer claims
  • Store IDs are fictional zone-codes (Dallas Zone 2 metro)
  • Competitor sources marked "_illustrative" in source_id where stamped
  • Product names are generic ("Cage-Free Eggs 12ct") not brand-trademarked

Elasticity ranges per category sourced from real published findings:
  • Eggs, milk, bread, bananas        β -0.3 to -0.8 (staples — inelastic)
  • Premium dairy / organic           β -1.0 to -1.6
  • Frozen branded                    β -1.2 to -2.0
  • Soda multi-packs, snacks          β -1.5 to -2.8 (highly elastic)
  • Perishables (berries, avocados)   β -1.8 to -3.2 (deep promo response)
  • Pasta, dry grains, beans          β -0.5 to -1.2
  • Coffee, premium beverages         β -0.8 to -1.4
  • Beer, wine (alcohol)              β -0.6 to -1.4

KVI list mirrors what real US chains classify as traffic drivers:
  eggs, milk (multiple sizes), bread, bananas, ground beef, coffee,
  toilet paper, bottled water 24-pk, beer 12-pk, Coca-Cola 12-pk.

Output is deterministic per (sku, store) RNG seed so the demo is
reproducible across re-loads.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ids import new_id
from app.models import (
    BatchStatus,
    CompetitorPriceObservation,
    CompetitorProduct,
    CompetitorProductEntity,
    Environment,
    HistoricalSale,
    PriceAction,
    PriceBatch,
    ProductCategory,
    ProductCost,
    ProductEntity,
    RunMode,
    SKUProductLink,
)


# ──────────────────────────────────────────────────────────────────────
# Catalog
# ──────────────────────────────────────────────────────────────────────


@dataclass
class CatalogItem:
    """One SKU's complete profile — all data the demo needs at scale."""

    sku: str
    product_name: str
    category: str
    brand: str
    unit_size: str
    base_price: float
    beta: float            # elasticity — negative is normal
    cost_ratio: float      # cost / approved_price — defaults are realistic
    is_kvi: bool = False
    is_perishable: bool = False
    perishable_days: Optional[int] = None  # markdown deadline window
    base_quantity: int = 50  # baseline daily unit sales (canary store)
    # Competitor positioning as % offsets from your price.
    # Real-world: Whole Foods +15-25%, Amazon Fresh ±5%, Costco -15%,
    # Aldi -20%. Per-SKU overrides allow KVI parity at Walmart-style chains.
    competitor_offsets: dict = field(default_factory=lambda: {
        "whole_foods_illustrative": 18.0,
        "amazon_fresh_illustrative": 2.0,
        "costco_illustrative": -12.0,
        "aldi_illustrative": -18.0,
    })


# Categories used by the graph. Hierarchical for realism (Dairy → Cheese
# → Hard Cheese), but the catalog only references the leaf.
CATEGORY_TREE = {
    "Dairy & Eggs": ["Milk", "Eggs", "Yogurt", "Cheese", "Butter"],
    "Produce": ["Fruit", "Vegetables"],
    "Bakery": ["Bread", "Pastry"],
    "Meat & Seafood": ["Beef", "Poultry", "Pork", "Seafood"],
    "Frozen": ["Ice Cream", "Frozen Meals", "Frozen Vegetables", "Frozen Pizza"],
    "Beverages": ["Soda", "Juice", "Coffee & Tea", "Water", "Energy Drinks"],
    "Snacks": ["Chips", "Cookies & Crackers", "Nuts"],
    "Packaged Grocery": ["Pasta", "Rice & Grains", "Sauces", "Cereal", "Canned", "Oils"],
}


# Tight curated catalog. Numbers chosen from published US grocery
# elasticities + observed retail prices (Walmart, Kroger, HEB ranges).
CATALOG: list[CatalogItem] = [
    # ── Dairy & Eggs ─────────────────────────────────────────────────
    CatalogItem("dairy-eggs-cage-free-12", "Cage-Free Large Brown Eggs 12ct",
                "Eggs", "Demo Farms", "12 ct", 4.49, -0.55, 0.40, is_kvi=True, base_quantity=180),
    CatalogItem("dairy-eggs-organic-18", "Organic Pasture-Raised Eggs 18ct",
                "Eggs", "Sunrise Organic", "18 ct", 8.99, -1.10, 0.42, base_quantity=55),
    CatalogItem("dairy-eggs-standard-12", "Grade A Large Eggs 12ct",
                "Eggs", "Value Pick", "12 ct", 2.99, -0.50, 0.42, is_kvi=True, base_quantity=240),
    CatalogItem("dairy-milk-whole-1gal", "Whole Milk 1 Gallon",
                "Milk", "Sunrise Dairy", "1 gal", 4.49, -0.65, 0.55, is_kvi=True, base_quantity=210),
    CatalogItem("dairy-milk-2pct-1gal", "2% Reduced Fat Milk 1 Gallon",
                "Milk", "Sunrise Dairy", "1 gal", 4.49, -0.62, 0.55, is_kvi=True, base_quantity=195),
    CatalogItem("dairy-milk-organic-half", "Organic Whole Milk 1/2 Gallon",
                "Milk", "Local Pasture", "0.5 gal", 5.49, -1.25, 0.45, base_quantity=70),
    CatalogItem("dairy-milk-almond-half", "Unsweetened Almond Milk 1/2 Gallon",
                "Milk", "Plant Pure", "0.5 gal", 4.49, -1.45, 0.40, base_quantity=85),
    CatalogItem("dairy-milk-oat-quart", "Oat Milk Original 32 fl oz",
                "Milk", "Plant Pure", "32 oz", 4.99, -1.55, 0.42, base_quantity=65),
    CatalogItem("dairy-yogurt-greek-32oz", "Greek Yogurt Plain 32oz",
                "Yogurt", "Mediterranean Mark", "32 oz", 5.99, -1.20, 0.43, base_quantity=80),
    CatalogItem("dairy-yogurt-vanilla-32oz", "Vanilla Yogurt 32oz",
                "Yogurt", "Mediterranean Mark", "32 oz", 4.99, -1.30, 0.42,
                is_perishable=True, perishable_days=7, base_quantity=75),
    CatalogItem("dairy-cheese-cheddar-8oz", "Sharp Cheddar Block 8oz",
                "Cheese", "Tillamook Style", "8 oz", 4.79, -0.95, 0.50, base_quantity=110),
    CatalogItem("dairy-cheese-mozz-shred", "Mozzarella Shredded 8oz",
                "Cheese", "Italian Heritage", "8 oz", 3.99, -1.05, 0.48, base_quantity=120),
    CatalogItem("dairy-butter-unsalted", "Unsalted Butter 4 Sticks 16oz",
                "Butter", "Creamery Best", "16 oz", 5.99, -0.85, 0.50, base_quantity=95),
    CatalogItem("dairy-cream-cheese-8oz", "Plain Cream Cheese 8oz",
                "Cheese", "Philly Style", "8 oz", 3.49, -1.10, 0.46, base_quantity=85),
    CatalogItem("dairy-half-and-half-pint", "Half & Half 1 Pint",
                "Milk", "Sunrise Dairy", "1 pt", 2.49, -0.80, 0.52, base_quantity=70),

    # ── Produce ──────────────────────────────────────────────────────
    CatalogItem("produce-bananas-lb", "Bananas per lb",
                "Fruit", "Tropical Source", "1 lb", 0.59, -0.45, 0.55, is_kvi=True, base_quantity=420,
                competitor_offsets={"whole_foods_illustrative": 35, "amazon_fresh_illustrative": 0,
                                    "costco_illustrative": -5, "aldi_illustrative": -10}),
    CatalogItem("produce-apples-gala-3lb", "Gala Apples 3lb Bag",
                "Fruit", "Orchard Direct", "3 lb", 4.99, -1.05, 0.50, base_quantity=85),
    CatalogItem("produce-apples-honeycrisp", "Honeycrisp Apples per lb",
                "Fruit", "Orchard Direct", "1 lb", 2.99, -1.30, 0.48, base_quantity=95),
    CatalogItem("produce-strawberries-1lb", "Fresh Strawberries 1lb",
                "Fruit", "Sun Valley Berry", "1 lb", 4.99, -2.10, 0.32,
                is_perishable=True, perishable_days=4, base_quantity=110),
    CatalogItem("produce-blueberries-pint", "Blueberries 1 Pint",
                "Fruit", "Sun Valley Berry", "1 pt", 4.49, -1.95, 0.35,
                is_perishable=True, perishable_days=5, base_quantity=75),
    CatalogItem("produce-blackberries-6oz", "Blackberries 6oz",
                "Fruit", "Sun Valley Berry", "6 oz", 3.99, -2.20, 0.32,
                is_perishable=True, perishable_days=4, base_quantity=55),
    CatalogItem("produce-avocados-4ct", "Hass Avocados 4 Count",
                "Fruit", "Mexican Grown", "4 ct", 4.99, -1.85, 0.40,
                is_perishable=True, perishable_days=6, base_quantity=120),
    CatalogItem("produce-lemons-2lb", "Lemons 2lb Bag",
                "Fruit", "California Citrus", "2 lb", 3.99, -1.10, 0.48, base_quantity=60),
    CatalogItem("produce-limes-1lb", "Limes 1lb Bag",
                "Fruit", "California Citrus", "1 lb", 2.99, -1.20, 0.50, base_quantity=70),
    CatalogItem("produce-grapes-2lb", "Red Seedless Grapes 2lb",
                "Fruit", "Vineyard Fresh", "2 lb", 6.99, -1.50, 0.42,
                is_perishable=True, perishable_days=7, base_quantity=85),
    CatalogItem("produce-tomatoes-vine-1lb", "Vine-Ripened Tomatoes 1lb",
                "Vegetables", "Greenhouse Best", "1 lb", 2.99, -1.30, 0.45,
                is_perishable=True, perishable_days=7, base_quantity=90),
    CatalogItem("produce-onions-yellow-3lb", "Yellow Onions 3lb Bag",
                "Vegetables", "Sweet Field", "3 lb", 3.49, -0.75, 0.50, base_quantity=110),
    CatalogItem("produce-potatoes-russet-5lb", "Russet Potatoes 5lb Bag",
                "Vegetables", "Idaho Best", "5 lb", 4.99, -0.65, 0.50, is_kvi=True, base_quantity=140),
    CatalogItem("produce-carrots-2lb", "Whole Carrots 2lb Bag",
                "Vegetables", "Field Fresh", "2 lb", 1.99, -0.80, 0.52, base_quantity=80),
    CatalogItem("produce-celery-bunch", "Celery Bunch",
                "Vegetables", "Field Fresh", "1 bunch", 2.49, -0.95, 0.50,
                is_perishable=True, perishable_days=10, base_quantity=70),
    CatalogItem("produce-lettuce-romaine", "Romaine Lettuce 3-Pack",
                "Vegetables", "Field Fresh", "3 ct", 3.99, -1.15, 0.45,
                is_perishable=True, perishable_days=7, base_quantity=95),
    CatalogItem("produce-spinach-baby-5oz", "Baby Spinach 5oz Bag",
                "Vegetables", "Field Fresh", "5 oz", 3.49, -1.25, 0.45,
                is_perishable=True, perishable_days=6, base_quantity=80),
    CatalogItem("produce-cucumber-each", "English Cucumber Each",
                "Vegetables", "Greenhouse Best", "1 ct", 1.99, -1.10, 0.50, base_quantity=85),
    CatalogItem("produce-peppers-bell-3pk", "Bell Peppers 3-Pack",
                "Vegetables", "Greenhouse Best", "3 ct", 4.99, -1.40, 0.42,
                is_perishable=True, perishable_days=10, base_quantity=70),
    CatalogItem("produce-broccoli-crown", "Broccoli Crown per lb",
                "Vegetables", "Field Fresh", "1 lb", 1.99, -0.85, 0.52, base_quantity=75),
    CatalogItem("produce-mushrooms-white-8oz", "White Mushrooms 8oz",
                "Vegetables", "Forest Floor", "8 oz", 2.99, -1.05, 0.48,
                is_perishable=True, perishable_days=8, base_quantity=65),

    # ── Bakery (all perishable) ──────────────────────────────────────
    CatalogItem("bakery-bread-white-loaf", "White Sandwich Bread Loaf",
                "Bread", "Daily Bake", "20 oz", 2.99, -0.70, 0.40, is_kvi=True,
                is_perishable=True, perishable_days=5, base_quantity=185),
    CatalogItem("bakery-bread-wheat-loaf", "100% Whole Wheat Bread Loaf",
                "Bread", "Daily Bake", "20 oz", 3.49, -0.85, 0.42,
                is_perishable=True, perishable_days=5, base_quantity=130),
    CatalogItem("bakery-bread-sourdough", "Artisan Sourdough Loaf",
                "Bread", "Stone Hearth", "1 lb", 5.99, -1.20, 0.38,
                is_perishable=True, perishable_days=4, base_quantity=70),
    CatalogItem("bakery-bagels-plain-6ct", "Plain Bagels 6-Pack",
                "Bread", "NY Style", "6 ct", 4.49, -1.05, 0.40,
                is_perishable=True, perishable_days=5, base_quantity=85),
    CatalogItem("bakery-buns-hotdog-8ct", "Hot Dog Buns 8-Pack",
                "Bread", "Daily Bake", "8 ct", 1.99, -0.95, 0.42, is_kvi=True,
                is_perishable=True, perishable_days=6, base_quantity=145),
    CatalogItem("bakery-buns-hamburger-8ct", "Hamburger Buns 8-Pack",
                "Bread", "Daily Bake", "8 ct", 1.99, -0.95, 0.42, is_kvi=True,
                is_perishable=True, perishable_days=6, base_quantity=160),
    CatalogItem("bakery-tortillas-flour-10ct", "Flour Tortillas 10-Pack",
                "Bread", "Mission Style", "10 ct", 2.99, -0.85, 0.45,
                is_perishable=True, perishable_days=14, base_quantity=110),
    CatalogItem("bakery-croissants-6ct", "Butter Croissants 6-Pack",
                "Pastry", "French Style", "6 ct", 5.99, -1.40, 0.38,
                is_perishable=True, perishable_days=3, base_quantity=55),

    # ── Meat & Seafood ───────────────────────────────────────────────
    CatalogItem("meat-ground-beef-80-20", "Ground Beef 80/20 per lb",
                "Beef", "Texas Choice", "1 lb", 5.99, -0.80, 0.55, is_kvi=True,
                is_perishable=True, perishable_days=4, base_quantity=150),
    CatalogItem("meat-ground-beef-90-10", "Ground Beef 90/10 per lb",
                "Beef", "Texas Choice", "1 lb", 7.99, -1.10, 0.52,
                is_perishable=True, perishable_days=4, base_quantity=90),
    CatalogItem("meat-ribeye-steak-lb", "Ribeye Steak per lb",
                "Beef", "Texas Choice", "1 lb", 16.99, -1.35, 0.48,
                is_perishable=True, perishable_days=4, base_quantity=45),
    CatalogItem("meat-chicken-breast-bnls-lb", "Boneless Chicken Breast per lb",
                "Poultry", "Sunny Farms", "1 lb", 4.99, -0.90, 0.55,
                is_perishable=True, perishable_days=3, base_quantity=160),
    CatalogItem("meat-chicken-thighs-bnls-lb", "Boneless Chicken Thighs per lb",
                "Poultry", "Sunny Farms", "1 lb", 3.99, -0.95, 0.55,
                is_perishable=True, perishable_days=3, base_quantity=110),
    CatalogItem("meat-chicken-whole-lb", "Whole Chicken per lb",
                "Poultry", "Sunny Farms", "1 lb", 2.49, -0.85, 0.58,
                is_perishable=True, perishable_days=3, base_quantity=75),
    CatalogItem("meat-bacon-12oz", "Hardwood Smoked Bacon 12oz",
                "Pork", "Smoke House", "12 oz", 7.99, -1.20, 0.50,
                is_perishable=True, perishable_days=14, base_quantity=130),
    CatalogItem("meat-pork-chops-bnls-lb", "Boneless Pork Chops per lb",
                "Pork", "Heritage Farms", "1 lb", 4.99, -1.00, 0.55,
                is_perishable=True, perishable_days=4, base_quantity=70),
    CatalogItem("meat-hotdogs-8ct", "Beef Hot Dogs 8-Pack",
                "Beef", "Cookout Choice", "8 ct", 4.99, -1.30, 0.45, is_kvi=True,
                is_perishable=True, perishable_days=21, base_quantity=180),
    CatalogItem("seafood-salmon-atlantic-lb", "Atlantic Salmon Fillet per lb",
                "Seafood", "Northern Catch", "1 lb", 12.99, -1.45, 0.55,
                is_perishable=True, perishable_days=3, base_quantity=55),
    CatalogItem("seafood-shrimp-frozen-1lb", "Frozen Shrimp 1lb Bag",
                "Seafood", "Gulf Catch", "1 lb", 9.99, -1.30, 0.50, base_quantity=65),
    CatalogItem("meat-turkey-ground-1lb", "Ground Turkey 1lb",
                "Poultry", "Sunny Farms", "1 lb", 4.49, -1.10, 0.52,
                is_perishable=True, perishable_days=4, base_quantity=80),

    # ── Frozen ───────────────────────────────────────────────────────
    CatalogItem("frozen-pizza-pepperoni-12in", "Pepperoni Frozen Pizza 12in",
                "Frozen Pizza", "DiGiorno Style", "1 ea", 5.99, -1.55, 0.45, base_quantity=120),
    CatalogItem("frozen-pizza-cheese-12in", "Cheese Frozen Pizza 12in",
                "Frozen Pizza", "DiGiorno Style", "1 ea", 5.49, -1.50, 0.45, base_quantity=95),
    CatalogItem("frozen-pizza-supreme-thin", "Thin Crust Supreme Frozen Pizza",
                "Frozen Pizza", "Red Barron Style", "1 ea", 4.99, -1.65, 0.43, base_quantity=85),
    CatalogItem("frozen-ice-cream-vanilla", "Vanilla Bean Ice Cream 1.5qt",
                "Ice Cream", "Edys Style", "1.5 qt", 5.99, -1.45, 0.42, base_quantity=110),
    CatalogItem("frozen-ice-cream-choco", "Chocolate Ice Cream 1.5qt",
                "Ice Cream", "Edys Style", "1.5 qt", 5.99, -1.45, 0.42, base_quantity=100),
    CatalogItem("frozen-ice-cream-premium", "Premium Vanilla Bean Pint",
                "Ice Cream", "Haagen Style", "1 pt", 5.99, -1.80, 0.40, base_quantity=70),
    CatalogItem("frozen-veggies-mixed-12oz", "Frozen Mixed Vegetables 12oz",
                "Frozen Vegetables", "Birds Eye Style", "12 oz", 1.99, -0.95, 0.48, base_quantity=85),
    CatalogItem("frozen-veggies-broccoli", "Frozen Broccoli Florets 12oz",
                "Frozen Vegetables", "Birds Eye Style", "12 oz", 1.99, -0.95, 0.48, base_quantity=75),
    CatalogItem("frozen-fries-shoestring", "Frozen Shoestring Fries 2lb",
                "Frozen Vegetables", "Ore-Ida Style", "32 oz", 4.49, -1.30, 0.45, base_quantity=100),
    CatalogItem("frozen-fries-tater-tots", "Frozen Tater Tots 32oz",
                "Frozen Vegetables", "Ore-Ida Style", "32 oz", 4.99, -1.35, 0.45, base_quantity=85),
    CatalogItem("frozen-meal-lasagna", "Frozen Lasagna Family Size",
                "Frozen Meals", "Stouffer Style", "38 oz", 8.99, -1.60, 0.42, base_quantity=70),
    CatalogItem("frozen-meal-mac-cheese", "Frozen Mac & Cheese Family Size",
                "Frozen Meals", "Stouffer Style", "20 oz", 5.99, -1.50, 0.45, base_quantity=80),
    CatalogItem("frozen-meal-lean", "Lean Cuisine Variety Box",
                "Frozen Meals", "Lean Choice", "10 oz", 3.49, -1.35, 0.45, base_quantity=120),
    CatalogItem("frozen-burritos-bean-8ct", "Bean & Cheese Burritos 8ct",
                "Frozen Meals", "Mission Style", "32 oz", 5.49, -1.25, 0.45, base_quantity=75),
    CatalogItem("frozen-chicken-nuggets-2lb", "Frozen Chicken Nuggets 2lb",
                "Frozen Meals", "Tyson Style", "2 lb", 8.99, -1.40, 0.45, base_quantity=95),
    CatalogItem("frozen-waffles-eggo-10ct", "Frozen Waffles 10ct",
                "Frozen Meals", "Kelloggs Style", "10 ct", 3.49, -1.10, 0.45, base_quantity=110),
    CatalogItem("frozen-veggies-corn-1lb", "Frozen Sweet Corn 1lb",
                "Frozen Vegetables", "Birds Eye Style", "1 lb", 1.99, -0.95, 0.48, base_quantity=80),
    CatalogItem("frozen-pizza-rolls-50ct", "Pizza Rolls 50ct",
                "Frozen Meals", "Totino Style", "50 ct", 6.99, -1.55, 0.42, base_quantity=70),

    # ── Beverages ────────────────────────────────────────────────────
    CatalogItem("bev-coke-12pk-cans", "Coca-Cola Style Cola 12-Pack Cans",
                "Soda", "Cola Brand", "12 ct", 7.99, -1.85, 0.50, is_kvi=True, base_quantity=240),
    CatalogItem("bev-coke-2L", "Cola 2-Liter Bottle",
                "Soda", "Cola Brand", "2 L", 2.49, -1.50, 0.50, base_quantity=180),
    CatalogItem("bev-coke-6pk", "Cola 6-Pack Cans",
                "Soda", "Cola Brand", "6 ct", 4.99, -1.65, 0.50, base_quantity=110),
    CatalogItem("bev-pepsi-12pk", "Cola Alternative 12-Pack",
                "Soda", "Pepsi Brand", "12 ct", 7.99, -1.85, 0.50, base_quantity=190),
    CatalogItem("bev-pepsi-2L", "Cola Alternative 2-Liter",
                "Soda", "Pepsi Brand", "2 L", 2.49, -1.55, 0.50, base_quantity=150),
    CatalogItem("bev-sprite-12pk", "Lemon-Lime Soda 12-Pack",
                "Soda", "Cola Brand", "12 ct", 7.99, -1.80, 0.50, base_quantity=130),
    CatalogItem("bev-water-24pk", "Spring Water 24-Pack 16.9oz",
                "Water", "Mountain Source", "24 ct", 5.99, -1.40, 0.45, is_kvi=True, base_quantity=210),
    CatalogItem("bev-water-1gal", "Distilled Water 1 Gallon",
                "Water", "Mountain Source", "1 gal", 1.49, -0.85, 0.55, base_quantity=160),
    CatalogItem("bev-sparkling-lacroix-8pk", "Sparkling Water 8-Pack",
                "Water", "Cellar Bubble", "8 ct", 4.99, -1.55, 0.45, base_quantity=120),
    CatalogItem("bev-sparkling-bubly-8pk", "Sparkling Water 8-Pack Alt",
                "Water", "Bubbly Brand", "8 ct", 4.99, -1.55, 0.45, base_quantity=110),
    CatalogItem("bev-oj-nfc-premium-52oz", "Premium NFC Orange Juice 52oz",
                "Juice", "Sunshine Grove", "52 oz", 6.49, -1.35, 0.43, base_quantity=140),
    CatalogItem("bev-oj-store-64oz", "Orange Juice 64oz",
                "Juice", "Value Pick", "64 oz", 4.49, -1.20, 0.45, base_quantity=110),
    CatalogItem("bev-apple-juice-64oz", "Apple Juice 64oz",
                "Juice", "Orchard Press", "64 oz", 3.99, -1.10, 0.45, base_quantity=90),
    CatalogItem("bev-coffee-folgers-30oz", "Ground Coffee Original Roast 30oz",
                "Coffee & Tea", "Folgers Style", "30 oz", 9.99, -1.05, 0.48, is_kvi=True, base_quantity=145),
    CatalogItem("bev-coffee-starbucks-12oz", "Premium Whole Bean Coffee 12oz",
                "Coffee & Tea", "Starbucks Style", "12 oz", 12.99, -1.25, 0.45, base_quantity=85),
    CatalogItem("bev-coffee-kcups-32ct", "K-Cup Coffee Pods 32ct",
                "Coffee & Tea", "Keurig Style", "32 ct", 16.99, -1.35, 0.45, base_quantity=95),
    CatalogItem("bev-tea-bags-100ct", "Black Tea Bags 100ct",
                "Coffee & Tea", "Lipton Style", "100 ct", 5.99, -0.90, 0.48, base_quantity=60),
    CatalogItem("bev-energy-redbull-4pk", "Energy Drink 4-Pack 8.4oz",
                "Energy Drinks", "Red Wing", "4 ct", 8.99, -1.65, 0.45, base_quantity=130),
    CatalogItem("bev-energy-monster-4pk", "Energy Drink XL 4-Pack 16oz",
                "Energy Drinks", "Beast Brand", "4 ct", 9.99, -1.70, 0.45, base_quantity=120),
    CatalogItem("bev-energy-celsius-12pk", "Functional Energy 12-Pack",
                "Energy Drinks", "Celsius Brand", "12 ct", 24.99, -1.85, 0.42, base_quantity=70),
    CatalogItem("bev-gatorade-8pk", "Sports Drink 8-Pack 20oz",
                "Energy Drinks", "Gatorade Style", "8 ct", 7.99, -1.55, 0.45, base_quantity=140),
    CatalogItem("bev-beer-budlight-12pk", "Domestic Light Beer 12-Pack 12oz",
                "Energy Drinks", "Bud Brand", "12 ct", 14.99, -0.85, 0.52, is_kvi=True, base_quantity=210),

    # ── Snacks ───────────────────────────────────────────────────────
    CatalogItem("snacks-chips-lays-8oz", "Classic Potato Chips 8oz",
                "Chips", "Lays Style", "8 oz", 4.49, -1.85, 0.42, base_quantity=145),
    CatalogItem("snacks-chips-kettle-8oz", "Kettle Cooked Chips Sea Salt 8oz",
                "Chips", "Kettle Brand", "8 oz", 4.99, -1.95, 0.42, base_quantity=110),
    CatalogItem("snacks-doritos-9oz", "Nacho Cheese Tortilla Chips 9oz",
                "Chips", "Doritos Style", "9 oz", 4.99, -1.90, 0.42, base_quantity=130),
    CatalogItem("snacks-tortilla-tostitos-12oz", "Tortilla Chips 12oz",
                "Chips", "Tostitos Style", "12 oz", 4.99, -1.65, 0.43, base_quantity=120),
    CatalogItem("snacks-pretzels-rold-16oz", "Salted Pretzels 16oz",
                "Chips", "Rold Gold Style", "16 oz", 3.49, -1.30, 0.45, base_quantity=85),
    CatalogItem("snacks-cheez-its-12oz", "Cheese Crackers 12oz",
                "Cookies & Crackers", "Cheez-Its Style", "12 oz", 4.49, -1.70, 0.43, base_quantity=110),
    CatalogItem("snacks-ritz-crackers-13oz", "Original Crackers 13oz",
                "Cookies & Crackers", "Ritz Style", "13 oz", 4.99, -1.50, 0.45, base_quantity=100),
    CatalogItem("snacks-triscuit-9oz", "Whole Grain Crackers 9oz",
                "Cookies & Crackers", "Triscuit Style", "9 oz", 4.49, -1.55, 0.45, base_quantity=80),
    CatalogItem("snacks-oreos-14oz", "Chocolate Sandwich Cookies 14oz",
                "Cookies & Crackers", "Oreo Style", "14 oz", 4.99, -1.75, 0.43, base_quantity=140),
    CatalogItem("snacks-chips-ahoy-13oz", "Chocolate Chip Cookies 13oz",
                "Cookies & Crackers", "Chips Ahoy Style", "13 oz", 4.49, -1.65, 0.43, base_quantity=95),
    CatalogItem("snacks-granola-bars-clif", "Energy Bars Variety Pack",
                "Cookies & Crackers", "Clif Style", "12 ct", 14.99, -1.45, 0.45, base_quantity=70),
    CatalogItem("snacks-nuts-cashews-16oz", "Roasted Cashews 16oz",
                "Nuts", "Premier Nut", "16 oz", 11.99, -1.40, 0.45, base_quantity=65),
    CatalogItem("snacks-nuts-almonds-16oz", "Whole Almonds 16oz",
                "Nuts", "Premier Nut", "16 oz", 8.99, -1.30, 0.45, base_quantity=80),
    CatalogItem("snacks-nuts-trail-mix-1lb", "Trail Mix 1lb",
                "Nuts", "Premier Nut", "1 lb", 7.99, -1.35, 0.45, base_quantity=70),
    CatalogItem("snacks-popcorn-orville-9oz", "Microwave Popcorn 3-Pack",
                "Chips", "Orville Style", "3 ct", 3.99, -1.50, 0.45, base_quantity=85),

    # ── Packaged Grocery ─────────────────────────────────────────────
    CatalogItem("grocery-pasta-spaghetti-1lb", "Spaghetti Pasta 1lb",
                "Pasta", "Barilla Style", "1 lb", 1.99, -0.80, 0.48, base_quantity=140),
    CatalogItem("grocery-pasta-penne-1lb", "Penne Pasta 1lb",
                "Pasta", "Barilla Style", "1 lb", 1.99, -0.80, 0.48, base_quantity=120),
    CatalogItem("grocery-pasta-rotini-1lb", "Rotini Pasta 1lb",
                "Pasta", "Barilla Style", "1 lb", 1.99, -0.80, 0.48, base_quantity=95),
    CatalogItem("grocery-pasta-sauce-jar", "Tomato Basil Pasta Sauce 24oz",
                "Sauces", "Italian Garden", "24 oz", 3.49, -1.10, 0.45, base_quantity=130),
    CatalogItem("grocery-pasta-sauce-alfredo", "Alfredo Pasta Sauce 15oz",
                "Sauces", "Italian Garden", "15 oz", 3.99, -1.15, 0.45, base_quantity=80),
    CatalogItem("grocery-rice-jasmine-5lb", "Jasmine Rice 5lb",
                "Rice & Grains", "Asian Choice", "5 lb", 8.99, -0.70, 0.48, base_quantity=85),
    CatalogItem("grocery-rice-basmati-2lb", "Basmati Rice 2lb",
                "Rice & Grains", "Asian Choice", "2 lb", 5.99, -0.85, 0.48, base_quantity=70),
    CatalogItem("grocery-rice-brown-2lb", "Brown Rice 2lb",
                "Rice & Grains", "Asian Choice", "2 lb", 3.99, -0.75, 0.48, base_quantity=65),
    CatalogItem("grocery-quinoa-2lb", "Quinoa 2lb",
                "Rice & Grains", "Ancient Grain", "2 lb", 9.99, -1.20, 0.45, base_quantity=45),
    CatalogItem("grocery-cereal-cheerios", "Whole Grain O Cereal 12oz",
                "Cereal", "General Brand", "12 oz", 4.99, -1.10, 0.45, base_quantity=120),
    CatalogItem("grocery-cereal-frosted-flakes", "Frosted Corn Flakes 13oz",
                "Cereal", "Kellogg Style", "13 oz", 4.99, -1.15, 0.45, base_quantity=110),
    CatalogItem("grocery-cereal-special-k", "Toasted Rice Cereal 12oz",
                "Cereal", "Kellogg Style", "12 oz", 4.99, -1.20, 0.45, base_quantity=75),
    CatalogItem("grocery-cereal-oats", "Rolled Oats 18oz",
                "Cereal", "Quaker Style", "18 oz", 4.49, -0.90, 0.45, base_quantity=95),
    CatalogItem("grocery-peanut-butter-creamy", "Creamy Peanut Butter 16oz",
                "Sauces", "Jif Style", "16 oz", 3.99, -1.00, 0.45, base_quantity=130),
    CatalogItem("grocery-peanut-butter-natural", "Natural Peanut Butter 16oz",
                "Sauces", "Jif Style", "16 oz", 4.99, -1.15, 0.45, base_quantity=70),
    CatalogItem("grocery-jam-strawberry", "Strawberry Preserves 18oz",
                "Sauces", "Smucker Style", "18 oz", 4.49, -1.10, 0.45, base_quantity=85),
    CatalogItem("grocery-tomatoes-canned-28oz", "Crushed Tomatoes 28oz",
                "Canned", "San Marzano Style", "28 oz", 2.99, -1.05, 0.48, base_quantity=110),
    CatalogItem("grocery-beans-black-15oz", "Black Beans 15oz Can",
                "Canned", "Bush Style", "15 oz", 1.49, -0.85, 0.50, base_quantity=140),
    CatalogItem("grocery-beans-kidney-15oz", "Kidney Beans 15oz Can",
                "Canned", "Bush Style", "15 oz", 1.49, -0.85, 0.50, base_quantity=95),
    CatalogItem("grocery-soup-campbell-tomato", "Tomato Soup 10.75oz",
                "Canned", "Campbell Style", "10.75 oz", 1.99, -0.95, 0.48, base_quantity=120),
    CatalogItem("grocery-soup-chicken-noodle", "Chicken Noodle Soup 10.75oz",
                "Canned", "Campbell Style", "10.75 oz", 1.99, -0.95, 0.48, base_quantity=125),
    CatalogItem("grocery-broth-chicken-32oz", "Low Sodium Chicken Broth 32oz",
                "Canned", "Pacific Style", "32 oz", 3.99, -1.05, 0.48, base_quantity=80),
    CatalogItem("grocery-olive-oil-evoo-17oz", "Extra Virgin Olive Oil 17oz",
                "Oils", "Bertolli Style", "17 oz", 9.99, -1.15, 0.48, base_quantity=85),
    CatalogItem("grocery-veg-oil-48oz", "Vegetable Oil 48oz",
                "Oils", "Wesson Style", "48 oz", 5.99, -0.90, 0.50, base_quantity=95),
    CatalogItem("grocery-toilet-paper-12pk", "Toilet Paper 12-Pack Mega Rolls",
                "Canned", "Charmin Style", "12 ct", 18.99, -0.95, 0.50, is_kvi=True, base_quantity=175),
    CatalogItem("grocery-paper-towels-6pk", "Paper Towels 6-Pack",
                "Canned", "Bounty Style", "6 ct", 14.99, -1.05, 0.48, base_quantity=130),
    CatalogItem("grocery-laundry-detergent", "Laundry Detergent 92oz",
                "Canned", "Tide Style", "92 oz", 13.99, -1.10, 0.48, base_quantity=110),
    CatalogItem("grocery-dish-soap-28oz", "Dish Soap 28oz",
                "Canned", "Dawn Style", "28 oz", 4.99, -1.05, 0.48, base_quantity=95),
]


# Store roster for the preset. Matches the existing Memorial Day zone so
# the BatchPicker on /operations shows everything together if the user
# stays in Demo mode.
STORE_IDS = ["214", "302", "317", "401"]
CANARY_STORE_IDS = ["214", "302"]
ZONE = "Dallas Zone 2"

HISTORY_DAYS = 60  # ample for stable elasticity fit
DEFAULT_BATCH_PREFIX = "realistic-scale"


# ──────────────────────────────────────────────────────────────────────
# Deterministic RNG — same seed → same data on every load
# ──────────────────────────────────────────────────────────────────────


def _det_rng(seed_str: str):
    state = [abs(hash(seed_str)) % (2**31)]

    def next_value() -> float:
        state[0] = (state[0] * 1103515245 + 12345) % (2**31)
        return state[0] / (2**31)

    return next_value


# ──────────────────────────────────────────────────────────────────────
# Per-category margin floor — matches the engine's policy defaults
# ──────────────────────────────────────────────────────────────────────


# ──────────────────────────────────────────────────────────────────────
# Loader
# ──────────────────────────────────────────────────────────────────────


def load_realistic_scale(
    db: Session,
    *,
    history_days: int = HISTORY_DAYS,
    reload: bool = False,
) -> dict:
    """Idempotent population of the catalog → product graph + cost catalog
    + N days of sales history + competitor observations.

    Returns rich summary so the UI can show what just got created.
    """
    # Idempotency: if entities for our catalog exist and reload=False, no-op
    sample_sku = CATALOG[0].sku
    existing_link = db.scalar(
        select(SKUProductLink).where(SKUProductLink.sku == sample_sku)
    )
    if existing_link and not reload:
        return _existing_summary(db)

    counters = {
        "categories_created": 0,
        "entities_created": 0,
        "sku_links_created": 0,
        "competitor_products_created": 0,
        "competitor_observations_created": 0,
        "product_costs_created": 0,
        "historical_sales_created": 0,
        "price_actions_created": 0,
        "batch_created": False,
    }
    by_category = {}

    # Container batch — gives every PriceAction a parent so the pricing
    # engine can find them (the engine scans batches → actions → prices).
    # Without this the catalog populates HistoricalSale + ProductCost but
    # the engine never sees the SKUs, because there's no current approved
    # price to optimize against.
    catalog_batch_id = f"batch_realistic_scale"
    if not db.scalar(select(PriceBatch).where(PriceBatch.id == catalog_batch_id)):
        db.add(PriceBatch(
            id=catalog_batch_id,
            external_id="realistic-scale-catalog",
            idempotency_key="realistic-scale-catalog-v1",
            name="Realistic Scale Catalog",
            zone=ZONE,
            run_mode=RunMode.LIVE_ROLLOUT,
            environment=Environment.SIMULATED_PRODUCTION,
            approved_by="realistic-scale-preset",
            total_store_count=len(STORE_IDS),
            status=BatchStatus.COMPLETED,  # Already verified — these are baseline prices
        ))
        db.flush()
        counters["batch_created"] = True

    # Build category hierarchy: top-level parent + leaves. ProductCategory.name
    # has a unique constraint, so check by name (not id) to coexist with the
    # existing seed-demo categories (Dairy & Eggs, Produce, Beverages).
    category_id_map: dict[str, str] = {}
    for parent_name, leaves in CATEGORY_TREE.items():
        existing_parent = db.scalar(
            select(ProductCategory).where(ProductCategory.name == parent_name)
        )
        if existing_parent:
            parent_id = existing_parent.id
        else:
            parent_id = f"cat_{_slugify(parent_name)}"
            db.add(ProductCategory(
                id=parent_id,
                name=parent_name,
                parent_id=None,
                description=f"Top-level category: {parent_name}",
            ))
            counters["categories_created"] += 1
        db.flush()
        for leaf in leaves:
            existing_leaf = db.scalar(
                select(ProductCategory).where(ProductCategory.name == leaf)
            )
            if existing_leaf:
                category_id_map[leaf] = existing_leaf.id
                continue
            leaf_id = f"cat_{_slugify(parent_name)}_{_slugify(leaf)}"
            db.add(ProductCategory(
                id=leaf_id,
                name=leaf,
                parent_id=parent_id,
                description=f"{parent_name} → {leaf}",
            ))
            counters["categories_created"] += 1
            category_id_map[leaf] = leaf_id
        db.flush()

    now = datetime.now(timezone.utc)

    for item in CATALOG:
        # Entity
        entity_id = f"pe_{_short_id(item.sku)}"
        entity = db.scalar(select(ProductEntity).where(ProductEntity.id == entity_id))
        if entity is None:
            entity = ProductEntity(
                id=entity_id,
                canonical_title=item.product_name,
                brand=item.brand,
                manufacturer=item.brand,
                upc=None,
                category_id=category_id_map.get(item.category),
                unit_size=item.unit_size,
                attributes={
                    "kvi": item.is_kvi,
                    "perishable": item.is_perishable,
                    "realistic_scale_preset": True,
                },
                match_confidence=1.0,
                # is_manual=True marks this as curated demo data. Live
                # mode hides every is_manual entity (unless it also has
                # the bootstrapped_from_scenario flag from a user CSV
                # upload), keeping the Realistic Scale catalog scoped to
                # Demo mode just like the Memorial Day showcase.
                is_manual=True,
            )
            db.add(entity)
            db.flush()
            counters["entities_created"] += 1

        # SKU link (one per store would be excessive — link once at zone level)
        link_id = f"link_{_short_id(item.sku)}"
        if not db.scalar(select(SKUProductLink).where(SKUProductLink.id == link_id)):
            db.add(SKUProductLink(
                id=link_id,
                sku=item.sku,
                entity_id=entity.id,
                zone_id=ZONE,
            ))
            counters["sku_links_created"] += 1

        # Cost catalog
        if not db.scalar(select(ProductCost).where(ProductCost.sku == item.sku)):
            db.add(ProductCost(
                id=f"cost_{_short_id(item.sku)}",
                sku=item.sku,
                cost=round(item.base_price * item.cost_ratio, 2),
                effective_from=now,
            ))
            counters["product_costs_created"] += 1

        # Competitor observations (one per source per entity)
        for source_id, offset_pct in item.competitor_offsets.items():
            comp_price = round(item.base_price * (1 + offset_pct / 100), 2)
            cp_id = f"cp_{_short_id(item.sku)}_{_short_id(source_id)}"
            stable_key = f"{source_id}:{item.sku}"
            # Check by stable_key (the actual UNIQUE constraint) rather
            # than id — protects against ID drift between loader versions.
            if db.scalar(
                select(CompetitorProduct).where(CompetitorProduct.stable_key == stable_key)
            ):
                continue
            db.add(CompetitorProduct(
                id=cp_id,
                source_id=source_id,
                external_id=f"{source_id}_{item.sku}",
                stable_key=stable_key,
                title=item.product_name,
                price=comp_price,
                currency="USD",
                category=item.category,
                availability="in_stock",
                raw_attributes={"realistic_scale_preset": True},
            ))
            db.flush()  # FK ordering for Postgres
            counters["competitor_products_created"] += 1
            db.add(CompetitorProductEntity(
                id=f"cpe_{_short_id(item.sku)}_{_short_id(source_id)}",
                competitor_product_id=cp_id,
                entity_id=entity.id,
                match_score=0.92,
            ))
            db.add(CompetitorPriceObservation(
                id=f"obs_{_short_id(item.sku)}_{_short_id(source_id)}",
                competitor_product_id=cp_id,
                entity_id=entity.id,
                price=comp_price,
                currency="USD",
                zone_id=ZONE,
                store_id=None,
                observed_at=now - timedelta(hours=2),
                delta_pct=offset_pct,
            ))
            counters["competitor_observations_created"] += 1

        # PriceAction per (sku, store) — gives the pricing engine a
        # current approved price to optimize against. Without these the
        # 139-SKU catalog populates history + costs but the engine never
        # discovers the SKUs.
        for store in STORE_IDS:
            action_id = f"act_rs_{_short_id(item.sku)}_{store}"
            if not db.scalar(select(PriceAction).where(PriceAction.id == action_id)):
                db.add(PriceAction(
                    id=action_id,
                    batch_id=catalog_batch_id,
                    sku=item.sku,
                    store_id=store,
                    product_name=item.product_name,
                    approved_price=item.base_price,
                    prior_price=item.base_price,  # baseline — no change yet
                    reason="Realistic Scale baseline",
                    is_kvi=item.is_kvi,
                    is_perishable=item.is_perishable,
                ))
                counters["price_actions_created"] += 1

        # Historical sales — deterministic per (sku, store)
        for store in STORE_IDS:
            rng = _det_rng(f"{item.sku}|{store}")
            A = item.base_quantity / (item.base_price ** item.beta)
            # Realistic price variance: 5 levels around base
            price_levels = [
                round(item.base_price * f, 2)
                for f in (0.92, 0.96, 1.00, 1.04, 1.08)
            ]
            for d in range(history_days):
                day = now - timedelta(days=history_days - d)
                # Rotate price levels; promotional days occasional
                level_idx = (d + hash(store) % 5) % len(price_levels)
                price = price_levels[level_idx]
                is_promo = rng() < 0.05  # 5% promo days
                effective_price = price * 0.78 if is_promo else price
                q_expected = A * (effective_price ** item.beta)
                if day.weekday() >= 5:
                    q_expected *= 1.15
                if is_promo:
                    q_expected *= 1.8
                noise = math.exp((rng() - 0.5) * 0.18)
                q = max(1, int(q_expected * noise))
                db.add(HistoricalSale(
                    id=f"hs_{_short_id(item.sku)}_{store}_{d}",
                    sku=item.sku,
                    store_id=store,
                    date=day,
                    price=round(effective_price, 2),
                    units_sold=q,
                    on_promotion=is_promo,
                ))
                counters["historical_sales_created"] += 1

        by_category[item.category] = by_category.get(item.category, 0) + 1

    db.commit()

    return {
        "loaded": True,
        "summary": {
            "skus_in_catalog": len(CATALOG),
            "kvi_skus": sum(1 for c in CATALOG if c.is_kvi),
            "perishable_skus": sum(1 for c in CATALOG if c.is_perishable),
            "categories_top_level": len(CATEGORY_TREE),
            "categories_leaf": sum(len(v) for v in CATEGORY_TREE.values()),
            "stores": len(STORE_IDS),
            "history_days": history_days,
            "competitor_sources": 4,
            "skus_per_category": by_category,
            **counters,
        },
        "note": (
            "Catalog loaded — every grocery surface now has realistic-scale data. "
            "Run the pricing engine and open /operations to see how the working "
            "platform handles ~700 PriceActions instead of three."
        ),
    }


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _slugify(s: str) -> str:
    return (
        s.lower()
        .replace(" & ", "-")
        .replace(" ", "-")
        .replace("'", "")
        .replace(",", "")
    )


def _short_id(s: str) -> str:
    """Process-independent 12-char id derived from sha256(s).

    Python's built-in hash() is randomized per process via PYTHONHASHSEED,
    so it would produce different IDs each container restart — breaking
    the loader's idempotency. sha256 is deterministic across processes
    and platforms, which is what idempotent seeding requires.
    """
    import hashlib
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:12]


def _existing_summary(db: Session) -> dict:
    """Return a stable summary when the preset has already been loaded."""
    skus = [item.sku for item in CATALOG]
    have_costs = db.scalar(
        select(_func_count(ProductCost.id)).where(ProductCost.sku.in_(skus))
    )
    have_entities = db.scalar(
        select(_func_count(ProductEntity.id)).where(
            ProductEntity.id.in_([f"pe_{_short_id(item.sku)}" for item in CATALOG])
        )
    )
    return {
        "loaded": False,
        "note": "Realistic Scale preset already present — use ?reload=true to wipe and re-seed.",
        "summary": {
            "skus_in_catalog": len(CATALOG),
            "existing_costs": int(have_costs or 0),
            "existing_entities": int(have_entities or 0),
        },
    }


# Tiny SQLAlchemy func.count helper kept local to avoid an extra import line
def _func_count(col):
    from sqlalchemy import func
    return func.count(col)
