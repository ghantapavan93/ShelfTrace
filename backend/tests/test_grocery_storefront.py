"""Tests for the synthetic grocery storefront + fresh_market_demo spider.

Covers:
  • Storefront HTML rendering (pagination, item count, next-aisle link)
  • Deterministic per-bucket price drift (idempotent within a minute, moves
    across minutes)
  • The grocery spider's own selector pack parsing the storefront markup
  • Full pipeline (validate → dedupe → upsert → price-history) over the
    rendered pages via run_with_fixture_html — no network
  • Price-change detection + history delta across buckets
  • Registry + storefront route wiring
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import CompetitorPriceHistory, CompetitorProduct
from app.scrapers.pipeline import run_with_fixture_html
from app.scrapers.registry import get_spider, list_sources
from app.scrapers.spiders.fresh_market import FreshMarketDemoSpider
from app.scrapers.storefront import (
    CATALOG,
    PER_PAGE,
    page_count,
    price_for,
    render_catalog_page,
)

BASE = "http://localhost:8000/demo-storefront/aisle"


def _page_url(page: int) -> str:
    return f"{BASE}/page-{page}.html"


def _all_pages(bucket: int) -> list[tuple[str, str]]:
    return [(_page_url(p), render_catalog_page(p, bucket=bucket)) for p in range(1, page_count() + 1)]


def _first_bucket_with_changes(base_bucket: int = 0) -> int:
    """Find a later bucket where at least one catalog price differs from
    `base_bucket` — used to deterministically exercise price-change logic."""
    base = {it.sku: price_for(it, base_bucket) for it in CATALOG}
    for b in range(base_bucket + 1, base_bucket + 60):
        if any(price_for(it, b) != base[it.sku] for it in CATALOG):
            return b
    raise AssertionError("no bucket with price movement found in range")


# ── Rendering ──────────────────────────────────────────────────────────────
def test_page_one_renders_full_page_with_next_link():
    html = render_catalog_page(1, bucket=0)
    assert html.count('class="grocery-item"') == PER_PAGE
    assert 'class="next-aisle"' in html
    assert "page-2.html" in html
    # Memorial Day demo SKU is on the first aisle
    assert 'data-sku="milk-organic-1gal"' in html


def test_last_page_has_no_next_link():
    html = render_catalog_page(page_count(), bucket=0)
    assert 'class="next-aisle"' not in html


def test_rendering_is_deterministic_per_bucket():
    assert render_catalog_page(1, bucket=7) == render_catalog_page(1, bucket=7)


# ── Price drift ──────────────────────────────────────────────────────────────
def test_price_for_is_deterministic():
    item = CATALOG[0]
    assert price_for(item, 42) == price_for(item, 42)


def test_some_prices_move_across_buckets_but_not_all():
    b = _first_bucket_with_changes(0)
    moved = sum(1 for it in CATALOG if price_for(it, b) != price_for(it, 0))
    assert 0 < moved < len(CATALOG)  # a realistic subset reprices, not everything


def test_drifted_price_stays_within_six_percent():
    for b in range(0, 12):
        for it in CATALOG:
            p = price_for(it, b)
            assert abs(p - it.base_price) <= it.base_price * 0.0601 + 0.005


# ── Spider parsing (its own selector pack) ──────────────────────────────────
def test_spider_parses_grocery_markup():
    html = render_catalog_page(1, bucket=0)
    rows = list(FreshMarketDemoSpider.parse(html, _page_url(1)))
    assert len(rows) == PER_PAGE

    milk = next(r for r in rows if r.external_id == "milk-organic-1gal")
    assert milk.title == "Organic Whole Milk, 1 Gallon"
    assert milk.currency == "USD"
    assert milk.category == "Dairy & Eggs"
    assert milk.availability == "in_stock"
    assert milk.stable_key == "fresh_market_demo:milk-organic-1gal"
    assert milk.price > 0
    assert milk.image_url and milk.image_url.endswith("milk-organic-1gal.svg")


def test_spider_normalizes_low_stock_to_limited():
    html = render_catalog_page(1, bucket=0)
    # salmon is seeded low_stock — find whichever page it lands on
    for p in range(1, page_count() + 1):
        rows = list(FreshMarketDemoSpider.parse(render_catalog_page(p, bucket=0), _page_url(p)))
        match = [r for r in rows if r.external_id == "salmon-atlantic-lb"]
        if match:
            assert match[0].availability == "limited"
            return
    raise AssertionError("salmon item not found in storefront")


def test_spider_finds_and_stops_pagination():
    html1 = render_catalog_page(1, bucket=0)
    nxt = FreshMarketDemoSpider.next_page_url(html1, _page_url(1))
    assert nxt and nxt.endswith("page-2.html")

    last = render_catalog_page(page_count(), bucket=0)
    assert FreshMarketDemoSpider.next_page_url(last, _page_url(page_count())) is None


# ── Pipeline end-to-end (no network) ────────────────────────────────────────
def test_pipeline_persists_full_catalog(db):
    result = run_with_fixture_html(db, "fresh_market_demo", _all_pages(bucket=0))
    assert result.products_persisted == len(CATALOG)
    assert result.products_inserted == len(CATALOG)
    rows = list(db.scalars(select(CompetitorProduct)))
    assert {r.source_id for r in rows} == {"fresh_market_demo"}
    titles = {r.title for r in rows}
    assert "Organic Whole Milk, 1 Gallon" in titles


def test_rerun_same_bucket_is_idempotent_no_price_changes(db):
    run_with_fixture_html(db, "fresh_market_demo", _all_pages(bucket=3))
    result2 = run_with_fixture_html(db, "fresh_market_demo", _all_pages(bucket=3))
    assert result2.products_inserted == 0
    assert result2.products_updated == len(CATALOG)
    assert result2.price_changes_detected == 0


def test_price_change_across_buckets_logs_history_delta(db):
    run_with_fixture_html(db, "fresh_market_demo", _all_pages(bucket=0))
    moving = _first_bucket_with_changes(0)
    result = run_with_fixture_html(db, "fresh_market_demo", _all_pages(bucket=moving))
    assert result.price_changes_detected > 0

    # A moved SKU has two price-history rows, the latest carrying a delta_pct
    moved_sku = next(it.sku for it in CATALOG if price_for(it, moving) != price_for(it, 0))
    rows = list(
        db.scalars(
            select(CompetitorPriceHistory)
            .where(CompetitorPriceHistory.stable_key == f"fresh_market_demo:{moved_sku}")
            .order_by(CompetitorPriceHistory.observed_at.desc())
        ),
    )
    assert len(rows) == 2
    assert rows[0].delta_pct is not None


# ── Registry + route wiring ──────────────────────────────────────────────────
def test_registry_includes_grocery_source():
    assert get_spider("fresh_market_demo") is FreshMarketDemoSpider
    ids = {s["source_id"] for s in list_sources()}
    assert {"fresh_market_demo", "books_demo"} <= ids


def test_start_url_targets_self_hosted_storefront():
    assert "/demo-storefront/aisle/page-1.html" in FreshMarketDemoSpider.START_URL


def test_storefront_route_serves_parseable_html():
    client = TestClient(app)
    resp = client.get("/demo-storefront/aisle/page-1.html")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    rows = list(FreshMarketDemoSpider.parse(resp.text, _page_url(1)))
    assert len(rows) == PER_PAGE


def test_storefront_image_route_returns_svg():
    client = TestClient(app)
    resp = client.get("/demo-storefront/img/milk-organic-1gal.svg")
    assert resp.status_code == 200
    assert "image/svg+xml" in resp.headers["content-type"]
    assert "<svg" in resp.text
