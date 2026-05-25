"""Spider base class + canonical product shape.

A Spider knows three things:
  • where to start (`SOURCE_ID`, `START_URL`)
  • how to parse a single page of HTML into ScrapedProduct rows
  • how (optionally) to discover the next page URL for pagination

The pipeline handles all the boring-but-critical glue: HTTP with retry
+ backoff, robots-friendly rate limiting, redirect handling, validation,
dedup by stable_key, persistence, and run-summary recording.

This keeps spider classes tiny (just markup knowledge) and the pipeline
testable in isolation against fixture HTML.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Protocol


@dataclass
class ScrapedProduct:
    """One row of normalised scraped output.

    `stable_key` is what the pipeline dedupes on across runs — usually
    `f"{source_id}:{external_id}"`. If the same product appears twice in
    one run, the second copy is dropped silently; across runs, the
    later observation updates the row in place.
    """

    source_id: str            # which spider produced this row, e.g. "books_demo"
    external_id: str          # site's product ID, used for stable_key
    stable_key: str           # f"{source_id}:{external_id}"
    title: str                # normalised, max 256 chars
    price: float              # normalised to USD where possible
    currency: str = "USD"
    category: str | None = None
    availability: str | None = None  # "in_stock" | "out_of_stock" | "limited" | None
    image_url: str | None = None
    source_url: str | None = None
    raw_attributes: dict = field(default_factory=dict)


@dataclass
class ScrapeRunResult:
    """Summary returned by pipeline.run_scrape — easy for the API layer to
    serialise into a response body and for tests to assert on."""

    source_id: str
    pages_fetched: int = 0
    products_seen: int = 0      # raw count, before dedup
    products_persisted: int = 0  # after dedup
    products_updated: int = 0    # existed before, refreshed price
    products_inserted: int = 0   # truly new
    errors: list[str] = field(default_factory=list)
    duration_ms: int = 0


class Spider(Protocol):
    """The interface every spider conforms to. Implementations live in
    `scrapers/spiders/`. Anything not on this protocol is per-spider
    detail and stays inside that module."""

    SOURCE_ID: str
    START_URL: str
    NAME: str            # human-readable, e.g. "Books to Scrape (demo)"
    DESCRIPTION: str     # one line shown in the UI
    MAX_PAGES: int       # hard cap so a runaway spider can't burn the budget

    @staticmethod
    def parse(html: str, page_url: str) -> Iterable[ScrapedProduct]:
        """Yield ScrapedProduct rows for everything on this page."""
        ...

    @staticmethod
    def next_page_url(html: str, page_url: str) -> str | None:
        """Return the absolute URL of the next page, or None when done."""
        ...
