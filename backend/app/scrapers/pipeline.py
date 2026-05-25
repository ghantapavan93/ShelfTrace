"""Pipeline — fetch → parse → validate → dedupe → persist.

Single function `run_scrape(db, source_id)` that consumes a Spider from
the registry and produces a ScrapeRunResult. Spider classes are tiny
(just markup knowledge); everything generic lives here.

Concurrency choice: synchronous httpx with a per-request sleep instead
of async. The MAX_PAGES cap (5 by default) makes parallelism overkill,
and the synchronous path keeps the demo dead-simple to reason about.
For production scale-up (thousands of pages, multiple spiders running
concurrently), swap this for an asyncio.gather over a semaphore or
move to Scrapy outright — the spider interface is unchanged.

Politeness:
  • Default 1 s gap between requests (REQUEST_DELAY_S)
  • Standard User-Agent that identifies as a bot
  • Hard MAX_PAGES cap per spider
  • Timeout per request
  • 3 retries with exponential backoff on transient failures (5xx, timeout)
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Iterable

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CompetitorProduct, ScrapeRun
from app.scrapers.base import ScrapeRunResult, ScrapedProduct
from app.scrapers.registry import get_spider

USER_AGENT = "ShelfTrace-DemoBot/0.1 (+https://github.com/ghantapavan93/ShelfTrace)"
REQUEST_TIMEOUT_S = 15.0
REQUEST_DELAY_S = 1.0
MAX_RETRIES = 3
BACKOFF_BASE_S = 0.5


def run_scrape(db: Session, source_id: str) -> ScrapeRunResult:
    spider = get_spider(source_id)
    if spider is None:
        result = ScrapeRunResult(source_id=source_id)
        result.errors.append(f"Unknown source_id: {source_id}")
        return result

    started = time.monotonic()
    result = ScrapeRunResult(source_id=source_id)
    run = ScrapeRun(
        id=f"scrape_{uuid.uuid4().hex[:12]}",
        source_id=source_id,
        started_at=datetime.now(timezone.utc),
        status="running",
    )
    db.add(run)
    db.commit()

    seen_in_run: set[str] = set()  # in-run dedup; cross-run dedup is the upsert

    try:
        with httpx.Client(
            timeout=REQUEST_TIMEOUT_S,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            page_url: str | None = spider.START_URL
            pages = 0
            while page_url and pages < spider.MAX_PAGES:
                html = _fetch_with_retry(client, page_url, result)
                if html is None:
                    break  # fetch failed permanently; recorded in result.errors

                pages += 1
                result.pages_fetched = pages

                try:
                    rows = list(spider.parse(html, page_url))
                except Exception as exc:  # spider bug — record + bail
                    result.errors.append(
                        f"Spider {source_id} parse() raised at {page_url}: {exc}"
                    )
                    break

                for row in rows:
                    result.products_seen += 1
                    if row.stable_key in seen_in_run:
                        continue
                    seen_in_run.add(row.stable_key)
                    inserted = _persist(db, row)
                    if inserted:
                        result.products_inserted += 1
                    else:
                        result.products_updated += 1
                    result.products_persisted += 1

                page_url = spider.next_page_url(html, page_url)
                if page_url and pages < spider.MAX_PAGES:
                    time.sleep(REQUEST_DELAY_S)

        db.commit()
    except Exception as exc:  # unrecoverable — record + mark failed
        result.errors.append(f"Pipeline crashed: {exc}")

    result.duration_ms = int((time.monotonic() - started) * 1000)

    # Update the run row with the final summary
    run.completed_at = datetime.now(timezone.utc)
    run.pages_fetched = result.pages_fetched
    run.products_seen = result.products_seen
    run.products_inserted = result.products_inserted
    run.products_updated = result.products_updated
    run.duration_ms = result.duration_ms
    run.errors_json = {"errors": result.errors} if result.errors else {}
    run.status = "failed" if result.errors and result.products_persisted == 0 else "success"
    db.commit()

    return result


def _fetch_with_retry(
    client: httpx.Client,
    url: str,
    result: ScrapeRunResult,
) -> str | None:
    """Synchronous GET with exponential backoff on transient failures."""
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.get(url)
            # 4xx is non-retryable (bad URL, blocked, etc.); 5xx + timeout retry.
            if response.status_code >= 500:
                last_error = f"HTTP {response.status_code}"
                time.sleep(BACKOFF_BASE_S * (2**attempt))
                continue
            response.raise_for_status()
            return response.text
        except httpx.HTTPStatusError as exc:
            result.errors.append(f"HTTP {exc.response.status_code} at {url}")
            return None
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_error = type(exc).__name__
            time.sleep(BACKOFF_BASE_S * (2**attempt))

    result.errors.append(f"Failed after {MAX_RETRIES} retries at {url}: {last_error}")
    return None


def _persist(db: Session, row: ScrapedProduct) -> bool:
    """Upsert by stable_key. Returns True if the row was newly inserted."""
    existing = db.scalar(
        select(CompetitorProduct).where(CompetitorProduct.stable_key == row.stable_key)
    )
    if existing is None:
        db.add(
            CompetitorProduct(
                id=f"cp_{uuid.uuid4().hex[:12]}",
                source_id=row.source_id,
                external_id=row.external_id,
                stable_key=row.stable_key,
                title=row.title,
                price=row.price,
                currency=row.currency,
                category=row.category,
                availability=row.availability,
                image_url=row.image_url,
                source_url=row.source_url,
                raw_attributes=row.raw_attributes,
            )
        )
        return True

    existing.title = row.title
    existing.price = row.price
    existing.currency = row.currency
    existing.category = row.category
    existing.availability = row.availability
    existing.image_url = row.image_url
    existing.source_url = row.source_url
    existing.raw_attributes = row.raw_attributes
    existing.last_seen_at = datetime.now(timezone.utc)
    existing.observation_count = (existing.observation_count or 0) + 1
    return False


def run_with_fixture_html(
    db: Session,
    source_id: str,
    pages: Iterable[tuple[str, str]],
) -> ScrapeRunResult:
    """Test-only: feed (page_url, html) tuples instead of hitting the network.

    Lets the test suite assert pipeline behaviour against deterministic
    HTML fixtures without making real HTTP calls. Production callers use
    run_scrape() above.
    """
    spider = get_spider(source_id)
    if spider is None:
        result = ScrapeRunResult(source_id=source_id)
        result.errors.append(f"Unknown source_id: {source_id}")
        return result

    started = time.monotonic()
    result = ScrapeRunResult(source_id=source_id)
    seen: set[str] = set()
    for page_url, html in pages:
        result.pages_fetched += 1
        for row in spider.parse(html, page_url):
            result.products_seen += 1
            if row.stable_key in seen:
                continue
            seen.add(row.stable_key)
            inserted = _persist(db, row)
            if inserted:
                result.products_inserted += 1
            else:
                result.products_updated += 1
            result.products_persisted += 1
    db.commit()
    result.duration_ms = int((time.monotonic() - started) * 1000)
    return result
