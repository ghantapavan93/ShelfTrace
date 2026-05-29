"""Synthetic competitor grocery storefront.

ShelfTrace serves this storefront from its own API and the `fresh_market_demo`
spider scrapes it over real HTTP through the exact production pipeline
(robots → retry/backoff → validate → dedupe → upsert → price-history). It
exists so the scraping demo shows *grocery-shaped* competitor data — an
aisle of milk, eggs, produce, beverages — without hitting a real retailer
(which would mean anti-bot defenses, ToS restrictions, and a commercial
scraping agreement; see ``spiders/whole_foods.py``).

Two honest properties make the demo feel alive without faking anything:

  • **Deterministic price drift.** Each one-minute "bucket" reprices a stable
    ~25% subset of the catalog within ±6%. Re-running a scrape inside the
    same minute is idempotent (no spurious price-history rows); a minute
    later a realistic handful of products have moved, so
    ``price_changes_detected`` lights up and ``competitor_price_history``
    accumulates real deltas.
  • **Grocery markup, not book markup.** The HTML uses a different selector
    pack (``article.grocery-item`` / ``.item-name`` / ``.item-price``) than
    the books reference spider, which concretely demonstrates the claim that
    swapping sources is a selector-pack change and nothing else.

The catalog deliberately includes the Memorial Day demo SKUs (organic milk,
cage-free eggs, strawberries, premium OJ) so scraped competitor prices can
be matched to canonical product-graph entities downstream.
"""
from __future__ import annotations

import html as _html
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class StoreItem:
    sku: str
    name: str
    department: str
    base_price: float
    stock: str = "in_stock"  # in_stock | low_stock | out_of_stock


# ── The aisle ────────────────────────────────────────────────────────────
# Ordered as it renders. The first four are the Memorial Day demo SKUs so a
# downstream entity match links scraped competitor prices to canonical SKUs.
CATALOG: list[StoreItem] = [
    StoreItem("milk-organic-1gal", "Organic Whole Milk, 1 Gallon", "Dairy & Eggs", 6.49),
    StoreItem("egg-cage-free-brown-12", "Cage-Free Brown Eggs, Dozen", "Dairy & Eggs", 4.99),
    StoreItem("strawberry-1lb", "Fresh Strawberries, 1 lb", "Produce", 3.99),
    StoreItem("oj-nfc-premium-52oz", "Premium Not-From-Concentrate Orange Juice, 52 oz", "Beverages", 5.49),
    # Dairy & Eggs
    StoreItem("butter-salted-1lb", "Salted Butter, 1 lb", "Dairy & Eggs", 3.79),
    StoreItem("yogurt-greek-plain-32oz", "Plain Greek Yogurt, 32 oz", "Dairy & Eggs", 5.29),
    StoreItem("cheddar-sharp-8oz", "Sharp Cheddar Block, 8 oz", "Dairy & Eggs", 4.49),
    StoreItem("oatmilk-original-halfgal", "Original Oat Milk, Half Gallon", "Dairy & Eggs", 4.29),
    # Produce
    StoreItem("banana-lb", "Bananas, per lb", "Produce", 0.59),
    StoreItem("avocado-hass-each", "Hass Avocado, each", "Produce", 1.29),
    StoreItem("tomato-roma-lb", "Roma Tomatoes, per lb", "Produce", 1.99),
    StoreItem("spinach-baby-5oz", "Organic Baby Spinach, 5 oz", "Produce", 3.49),
    StoreItem("apple-honeycrisp-lb", "Honeycrisp Apples, per lb", "Produce", 2.49),
    StoreItem("cucumber-seedless-each", "Seedless Cucumber, each", "Produce", 1.19),
    # Bakery
    StoreItem("bread-sourdough-loaf", "Artisan Sourdough Loaf", "Bakery", 4.99),
    StoreItem("bread-wheat-sandwich", "Whole Wheat Sandwich Bread", "Bakery", 2.99),
    StoreItem("muffin-blueberry-4ct", "Blueberry Muffins, 4 ct", "Bakery", 4.79),
    # Beverages
    StoreItem("coldbrew-coffee-32oz", "Cold Brew Coffee, 32 oz", "Beverages", 5.99),
    StoreItem("sparkling-water-12pk", "Sparkling Water, 12-pack", "Beverages", 4.99),
    StoreItem("kombucha-ginger-16oz", "Ginger Kombucha, 16 oz", "Beverages", 3.49),
    # Meat & Seafood
    StoreItem("chicken-breast-bnls-lb", "Boneless Chicken Breast, per lb", "Meat & Seafood", 5.99),
    StoreItem("ground-beef-8020-lb", "80/20 Ground Beef, per lb", "Meat & Seafood", 6.49),
    StoreItem("salmon-atlantic-lb", "Atlantic Salmon Fillet, per lb", "Meat & Seafood", 12.99, "low_stock"),
    # Pantry
    StoreItem("olive-oil-evoo-16oz", "Extra Virgin Olive Oil, 16 oz", "Pantry", 8.99),
    StoreItem("pasta-penne-16oz", "Organic Penne Pasta, 16 oz", "Pantry", 2.29),
    StoreItem("beans-black-15oz", "Canned Black Beans, 15 oz", "Pantry", 1.09),
    StoreItem("rice-jasmine-2lb", "Jasmine Rice, 2 lb", "Pantry", 4.49),
    StoreItem("peanut-butter-creamy-16oz", "Creamy Peanut Butter, 16 oz", "Pantry", 3.99),
    StoreItem("honey-raw-12oz", "Raw Wildflower Honey, 12 oz", "Pantry", 5.99),
    # Frozen
    StoreItem("frozen-blueberries-16oz", "Frozen Wild Blueberries, 16 oz", "Frozen", 4.29),
    StoreItem("icecream-vanilla-48oz", "Vanilla Bean Ice Cream, 48 oz", "Frozen", 5.49),
    StoreItem("pizza-margherita-frozen", "Frozen Margherita Pizza", "Frozen", 6.99),
    # Snacks
    StoreItem("tortilla-chips-12oz", "Tortilla Chips, 12 oz", "Snacks", 3.49),
    StoreItem("dark-chocolate-bar-3-5oz", "70% Dark Chocolate Bar, 3.5 oz", "Snacks", 2.99),
    StoreItem("mixed-nuts-16oz", "Roasted Mixed Nuts, 16 oz", "Snacks", 8.49),
    StoreItem("pretzel-twists-16oz", "Pretzel Twists, 16 oz", "Snacks", 2.79),
]

PER_PAGE = 12


def page_count() -> int:
    return (len(CATALOG) + PER_PAGE - 1) // PER_PAGE


# ── Deterministic price drift ──────────────────────────────────────────────
def _crc(s: str) -> int:
    """Stable cross-process hash. (Python's built-in ``hash`` is salted per
    process, so it can't be used for reproducible drift.)"""
    return zlib.crc32(s.encode("utf-8"))


def current_bucket(now: datetime | None = None) -> int:
    """One-minute time bucket. Scrapes within the same minute see identical
    prices (idempotent); a minute later a realistic subset has moved."""
    ts = (now or datetime.now(timezone.utc)).timestamp()
    return int(ts // 60)


def price_for(item: StoreItem, bucket: int) -> float:
    """Price of `item` in a given time bucket. ~25% of the catalog drifts per
    bucket within ±6% of base; the rest hold. Deterministic in (sku, bucket)."""
    if _crc(f"move:{item.sku}:{bucket}") % 100 < 25:
        raw = _crc(f"delta:{item.sku}:{bucket}") % 1201  # 0..1200
        pct = (raw - 600) / 10000.0                      # -0.0600 .. +0.0600
        return round(item.base_price * (1 + pct), 2)
    return round(item.base_price, 2)


# ── Stock-label rendering ──────────────────────────────────────────────────
_STOCK_LABEL = {
    "in_stock": "In Stock",
    "low_stock": "Low Stock",
    "out_of_stock": "Out of Stock",
}


def _dept_color(department: str) -> str:
    """Deterministic tile color per department for the placeholder SVG."""
    palette = ["#3b6", "#39c", "#c84", "#a5c", "#6a9", "#d6a", "#5b8", "#c66"]
    return palette[_crc(department) % len(palette)]


# ── HTML rendering ──────────────────────────────────────────────────────────
def _page_slice(page: int) -> list[StoreItem]:
    start = (page - 1) * PER_PAGE
    return CATALOG[start : start + PER_PAGE]


def render_catalog_page(page: int, bucket: int | None = None) -> str:
    """Render one aisle page as standalone HTML.

    The markup intentionally differs from the books reference spider so the
    `fresh_market_demo` spider exercises its own selector pack.
    """
    if bucket is None:
        bucket = current_bucket()
    items = _page_slice(page)
    total = page_count()

    cards: list[str] = []
    for it in items:
        price = price_for(it, bucket)
        label = _STOCK_LABEL.get(it.stock, "In Stock")
        stock_cls = it.stock.replace("_", "-")
        cards.append(
            f"""    <article class="grocery-item" data-sku="{_html.escape(it.sku)}">
      <img class="item-photo" src="/demo-storefront/img/{_html.escape(it.sku)}.svg" alt="{_html.escape(it.name)}" width="64" height="64" />
      <h2 class="item-name">{_html.escape(it.name)}</h2>
      <span class="item-dept">{_html.escape(it.department)}</span>
      <span class="item-price">${price:.2f}</span>
      <span class="item-stock {stock_cls}">{label}</span>
    </article>"""
        )

    pager = ""
    if page < total:
        pager = f'  <nav class="pager"><a class="next-aisle" href="page-{page + 1}.html">Next aisle &rarr;</a></nav>'

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fresh Market — Aisle {page} of {total}</title>
  <meta name="robots" content="all" />
  <style>
    body {{ font-family: -apple-system, system-ui, sans-serif; background: #0c0f14; color: #e8edf2; margin: 0; padding: 24px; }}
    header {{ display:flex; align-items:baseline; gap:12px; margin-bottom:18px; }}
    h1 {{ font-size: 20px; margin: 0; }}
    .tag {{ font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #7d8a99; }}
    .note {{ font-size: 11px; color: #6c7886; margin: 6px 0 18px; max-width: 640px; }}
    .aisle {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }}
    .grocery-item {{ background:#141a22; border:1px solid #1f2935; border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:4px; }}
    .item-photo {{ border-radius:8px; background:#0c0f14; }}
    .item-name {{ font-size:13px; font-weight:600; margin:6px 0 0; }}
    .item-dept {{ font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:#7d8a99; }}
    .item-price {{ font-size:16px; font-weight:700; color:#9ee37d; }}
    .item-stock {{ font-size:11px; }}
    .item-stock.in-stock {{ color:#9ee37d; }}
    .item-stock.low-stock {{ color:#ffd166; }}
    .item-stock.out-of-stock {{ color:#ff6b6b; }}
    .pager {{ margin-top:20px; }}
    .next-aisle {{ color:#7db7ff; text-decoration:none; font-size:14px; }}
  </style>
</head>
<body>
  <header>
    <h1>Fresh Market</h1>
    <span class="tag">Aisle {page} of {total}</span>
  </header>
  <p class="note">Synthetic competitor storefront served by ShelfTrace for scraping demos. Not a real retailer.</p>
  <section class="aisle">
{chr(10).join(cards)}
  </section>
{pager}
</body>
</html>"""


def render_item_svg(sku: str) -> str:
    """A tiny deterministic placeholder image so the scraped-products table
    renders a real <img> instead of a broken-image icon. Keyed off the SKU's
    department for a stable color."""
    item = next((i for i in CATALOG if i.sku == sku), None)
    department = item.department if item else "Pantry"
    color = _dept_color(department)
    initials = _html.escape((item.name[:2] if item else "?").upper())
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="10" fill="{color}" opacity="0.85"/>'
        f'<text x="32" y="40" font-family="sans-serif" font-size="24" font-weight="700" '
        f'fill="#0c0f14" text-anchor="middle">{initials}</text></svg>'
    )
