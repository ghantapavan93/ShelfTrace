"""Reference spider — books.toscrape.com.

Why books.toscrape.com? It's the canonical scraper-practice site:
explicitly built so engineers can demo extraction technique without
hitting a production retailer's bot defenses or violating a ToS. The
DATA SHAPE is identical to a competitor grocery listing — title, price,
category, in-stock flag, image — so the pipeline that consumes these
rows is the same pipeline you'd run against a real Whole Foods page.
The only thing that would change is the CSS selector pack and the
price-normalisation regex inside this single file.

The same pipeline can run against any spider via `app.scrapers.registry`.
A documented stub spider for a real grocer lives alongside this one in
`whole_foods.py` to show the production shape.
"""
from __future__ import annotations

from typing import Iterable
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.scrapers.base import ScrapedProduct


def _price_to_float(raw: str) -> float | None:
    """`'£51.77'` → `51.77`. Returns None when unparseable."""
    if not raw:
        return None
    cleaned = "".join(
        c for c in raw.strip() if c.isdigit() or c == "." or c == ","
    )
    cleaned = cleaned.replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _availability_norm(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip().lower()
    if "in stock" in s:
        return "in_stock"
    if "out of stock" in s:
        return "out_of_stock"
    return "limited"


class BooksDemoSpider:
    """Scraper-practice spider — same interface as the production stub."""

    SOURCE_ID = "books_demo"
    NAME = "Books to Scrape (demo)"
    DESCRIPTION = (
        "Scraper-practice site with the same data shape as a grocer's "
        "product listing. Use this to prove the pipeline; swap selectors "
        "in spiders/whole_foods.py for the real run."
    )
    START_URL = "https://books.toscrape.com/catalogue/page-1.html"
    MAX_PAGES = 5  # ~100 products — enough to demo without hammering

    @staticmethod
    def parse(html: str, page_url: str) -> Iterable[ScrapedProduct]:
        soup = BeautifulSoup(html, "lxml")
        for card in soup.select("article.product_pod"):
            link = card.select_one("h3 a")
            title = (link.get("title") or link.get_text(strip=True)) if link else ""
            relative = link.get("href") if link else None
            product_url = urljoin(page_url, relative) if relative else None
            # external_id from the product slug, e.g. ".../a-light-in-the-attic_1000/index.html"
            external_id = (
                relative.rstrip("/").split("/")[-2]
                if relative
                else title.lower().replace(" ", "-")
            )

            price_el = card.select_one("p.price_color")
            price = _price_to_float(price_el.get_text() if price_el else "")
            if price is None:
                continue  # skip rows we can't price — pipeline records this

            avail_el = card.select_one("p.availability")
            availability = _availability_norm(
                avail_el.get_text() if avail_el else None,
            )

            img_el = card.select_one("img")
            image_rel = img_el.get("src") if img_el else None
            image_url = urljoin(page_url, image_rel) if image_rel else None

            rating_el = card.select_one("p.star-rating")
            rating = None
            if rating_el:
                for cls in rating_el.get("class", []):
                    if cls in {"One", "Two", "Three", "Four", "Five"}:
                        rating = {"One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5}[cls]
                        break

            yield ScrapedProduct(
                source_id=BooksDemoSpider.SOURCE_ID,
                external_id=external_id,
                stable_key=f"{BooksDemoSpider.SOURCE_ID}:{external_id}",
                title=title[:256],
                price=price,
                currency="GBP",  # site lists in £; pipeline could FX-normalise
                category="Books",
                availability=availability,
                image_url=image_url,
                source_url=product_url,
                raw_attributes={"rating": rating} if rating else {},
            )

    @staticmethod
    def next_page_url(html: str, page_url: str) -> str | None:
        soup = BeautifulSoup(html, "lxml")
        nxt = soup.select_one("li.next a")
        if not nxt:
            return None
        href = nxt.get("href")
        return urljoin(page_url, href) if href else None
