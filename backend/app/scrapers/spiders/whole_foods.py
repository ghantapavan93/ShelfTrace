"""Documented stub for a real grocer spider — Whole Foods 365.

This is the SHAPE a production spider would take. It's intentionally not
wired into the registry because:

  1. Production retailer sites have anti-bot protection (Cloudflare,
     PerimeterX, DataDome) that requires browser-grade headless tooling
     (Playwright) + proxy rotation
  2. Most retailers' ToS prohibit unauthorised scraping. A real run
     would either require a commercial scraping agreement or an API
     partnership.
  3. The DEMO spider (books_demo.py) proves the pipeline. Wiring this
     one in would gain nothing for the portfolio and risk a 1-hour
     debugging session over a Cloudflare 403.

What changes between the demo and this:
  • Selectors (one file)
  • Add Playwright for JS rendering (one fetcher swap in pipeline.py)
  • Add a proxy pool (one config block)
  • The validation, dedup, persistence — UNCHANGED
"""
from __future__ import annotations

from typing import Iterable

from app.scrapers.base import ScrapedProduct


class WholeFoodsStubSpider:
    """Intentionally unwired — see module docstring."""

    SOURCE_ID = "whole_foods_365"
    NAME = "Whole Foods 365 (stub)"
    DESCRIPTION = (
        "Production-shape stub. Not wired — requires Playwright + proxy "
        "rotation + a scraping agreement. See docstring."
    )
    START_URL = (
        "https://www.wholefoodsmarket.com/products/all-products?store-id=10115"
    )
    MAX_PAGES = 0  # disabled

    @staticmethod
    def parse(html: str, page_url: str) -> Iterable[ScrapedProduct]:
        # The selector pack that WOULD work against the rendered DOM. Left
        # here as documentation of the eventual shape; the stub yields
        # nothing so accidentally enabling this spider is a no-op.
        return iter([])

    @staticmethod
    def next_page_url(html: str, page_url: str) -> str | None:
        return None
