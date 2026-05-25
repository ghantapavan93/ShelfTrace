"""Competitor price scraping subsystem.

Production-shaped data extraction layer that pulls product + price data
from competitor / external sources, validates and dedupes it, and
persists into the `competitor_products` table so the downstream pricing
engine can reference it.

Architecture (one folder per concern, matches the rest of app/):

    scrapers/
      __init__.py         (this file — public surface)
      base.py             abstract Spider + dataclasses
      pipeline.py         fetch → parse → validate → dedupe → persist
      registry.py         maps source_id → spider class
      spiders/
        books_demo.py     reference spider against a scraper-practice site
        whole_foods.py    documented stub showing the real shape

The demo spider targets books.toscrape.com — the standard scraper-
practice site — because:
  1. It's policy-friendly (designed for scrapers to hit)
  2. Has the same data shape as a grocery product listing
     (title, price, category, availability, image)
  3. Will not break the demo when a real site changes markup
  4. The pipeline that processes it is identical to what you'd run
     against a real competitor — the only thing that changes is the
     CSS selector pack inside the spider class

In production we'd swap to Playwright/Scrapy for JS-rendered sites and
add proxy rotation, but the spider INTERFACE here is the production
contract. See README "Scaling the scraper" for the upgrade path.
"""
from app.scrapers.base import RowError, ScrapedProduct, ScrapeRunResult, Spider
from app.scrapers.pipeline import run_scrape
from app.scrapers.registry import SPIDERS, get_spider, list_sources

__all__ = [
    "RowError",
    "ScrapedProduct",
    "ScrapeRunResult",
    "Spider",
    "SPIDERS",
    "get_spider",
    "list_sources",
    "run_scrape",
]
