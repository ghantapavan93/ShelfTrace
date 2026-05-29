"""Grocery reference spider — Fresh Market (synthetic storefront).

Unlike `books_demo` (which scrapes an external scraper-practice site to prove
the live-network path), this spider scrapes a grocery storefront that
ShelfTrace serves itself (see ``app/routers/storefront.py``). It's a *real*
HTTP scrape through the full pipeline — robots.txt, retry/backoff, validation,
dedupe, price-history — but the data is grocery-shaped (milk, eggs, produce)
and carries no real-retailer ToS risk.

The selector pack here is deliberately different from the books spider
(``article.grocery-item`` vs ``article.product_pod``) to demonstrate
concretely that onboarding a new source is a selector-pack change and nothing
else — the pipeline that consumes the rows is unchanged.

START_URL resolves to the running app's own origin so the scrape works
identically on localhost, in Docker, and on the deployed host (the app always
listens on ``localhost:$PORT``). Override with ``SCRAPE_STOREFRONT_BASE_URL``
if the storefront is hosted elsewhere.
"""
from __future__ import annotations

from typing import Iterable
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.config import settings
from app.scrapers.base import ScrapedProduct


def _price_to_float(raw: str) -> float | None:
    """`'$6.49'` → `6.49`. Returns None when unparseable."""
    if not raw:
        return None
    cleaned = "".join(c for c in raw.strip() if c.isdigit() or c == "." or c == ",")
    cleaned = cleaned.replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _availability_norm(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip().lower()
    if "out of stock" in s:
        return "out_of_stock"
    if "in stock" in s:
        return "in_stock"
    return "limited"  # "Low Stock" etc.


class FreshMarketDemoSpider:
    """Grocery storefront spider — same Spider interface as books_demo."""

    SOURCE_ID = "fresh_market_demo"
    NAME = "Fresh Market (demo storefront)"
    DESCRIPTION = (
        "Synthetic grocery storefront ShelfTrace serves and scrapes over real "
        "HTTP — grocery-shaped competitor data (milk, eggs, produce, beverages) "
        "without hitting a real retailer. Prices drift each minute so re-runs "
        "surface real price-change deltas."
    )
    START_URL = f"{settings.self_base_url}/demo-storefront/aisle/page-1.html"
    MAX_PAGES = 5

    @staticmethod
    def parse(html: str, page_url: str) -> Iterable[ScrapedProduct]:
        soup = BeautifulSoup(html, "lxml")
        for card in soup.select("article.grocery-item"):
            name_el = card.select_one(".item-name")
            title = name_el.get_text(strip=True) if name_el else ""

            external_id = (card.get("data-sku") or "").strip()
            if not external_id:
                external_id = title.lower().replace(" ", "-").replace(",", "")

            price_el = card.select_one(".item-price")
            price = _price_to_float(price_el.get_text() if price_el else "")
            if price is None:
                continue  # unparseable price — pipeline records the skip

            dept_el = card.select_one(".item-dept")
            category = dept_el.get_text(strip=True) if dept_el else None

            stock_el = card.select_one(".item-stock")
            availability = _availability_norm(
                stock_el.get_text() if stock_el else None,
            )

            img_el = card.select_one(".item-photo")
            image_rel = img_el.get("src") if img_el else None
            image_url = urljoin(page_url, image_rel) if image_rel else None

            yield ScrapedProduct(
                source_id=FreshMarketDemoSpider.SOURCE_ID,
                external_id=external_id,
                stable_key=f"{FreshMarketDemoSpider.SOURCE_ID}:{external_id}",
                title=title[:256],
                price=price,
                currency="USD",
                category=category,
                availability=availability,
                image_url=image_url,
                source_url=page_url,
                raw_attributes={"department": category} if category else {},
            )

    @staticmethod
    def next_page_url(html: str, page_url: str) -> str | None:
        soup = BeautifulSoup(html, "lxml")
        nxt = soup.select_one("a.next-aisle")
        if not nxt:
            return None
        href = nxt.get("href")
        return urljoin(page_url, href) if href else None
