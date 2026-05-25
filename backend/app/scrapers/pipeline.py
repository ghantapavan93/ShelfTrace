"""Pipeline — fetch → robots-check → parse → validate → dedupe → persist → log-price.

Single function `run_scrape(db, source_id, idempotency_key=None)` consuming
a Spider from the registry and producing a ScrapeRunResult.

What this function handles (so spiders don't have to):
  • robots.txt enforcement per host (cached)
  • 429 Too Many Requests with Retry-After header honored
  • 5xx + transient network errors with exponential backoff
  • Polite per-request delay (robots.txt crawl-delay wins if set)
  • Hard MAX_PAGES cap
  • Per-row validation with structured rejection log
  • Stable-key upsert + in-run dedup
  • Append-only price-history log (delta_pct computed vs last observation)
  • Idempotency: same idempotency_key returns the previous run's summary
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Iterable

import httpx
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models import (
    CompetitorPriceHistory,
    CompetitorProduct,
    ScrapeRun,
)
from app.scrapers import robots as robots_mod
from app.scrapers.base import RowError, ScrapeRunResult, ScrapedProduct
from app.scrapers.registry import get_spider

USER_AGENT = "ShelfTrace-DemoBot/0.1 (+https://github.com/ghantapavan93/ShelfTrace)"
REQUEST_TIMEOUT_S = 15.0
REQUEST_DELAY_S = 1.0
MAX_RETRIES = 3
BACKOFF_BASE_S = 0.5
MAX_RETRY_AFTER_S = 30.0  # cap honored Retry-After at 30s — beyond that we bail

# Validation thresholds
MIN_TITLE_LEN = 2
MAX_TITLE_LEN = 256
PRICE_MIN = 0.01
PRICE_MAX = 1_000_000


def run_scrape(
    db: Session,
    source_id: str,
    idempotency_key: str | None = None,
) -> ScrapeRunResult:
    # Idempotency: if a run with this key already exists, return its summary
    if idempotency_key:
        existing = db.scalar(
            select(ScrapeRun).where(ScrapeRun.idempotency_key == idempotency_key),
        )
        if existing is not None:
            return _result_from_run_row(existing)

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
        idempotency_key=idempotency_key,
        started_at=datetime.now(timezone.utc),
        status="running",
    )
    db.add(run)
    db.commit()

    seen_in_run: set[str] = set()

    try:
        with httpx.Client(
            timeout=REQUEST_TIMEOUT_S,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            page_url: str | None = spider.START_URL
            pages = 0
            while page_url and pages < spider.MAX_PAGES:
                # robots.txt check — most ethical line in this file
                if not robots_mod.can_fetch(page_url, USER_AGENT, client):
                    result.pages_skipped_by_robots += 1
                    result.errors.append(
                        f"robots.txt blocks {USER_AGENT} from {page_url}; stopping run.",
                    )
                    break

                html = _fetch_with_retry(client, page_url, result)
                if html is None:
                    break

                pages += 1
                result.pages_fetched = pages

                try:
                    rows = list(spider.parse(html, page_url))
                except Exception as exc:
                    result.errors.append(
                        f"Spider {source_id} parse() raised at {page_url}: {exc}",
                    )
                    break

                for row in rows:
                    result.products_seen += 1
                    # Validate before dedup so rejected rows are still counted
                    err = _validate(row, page_url)
                    if err is not None:
                        result.row_errors.append(err)
                        result.products_rejected += 1
                        continue
                    if row.stable_key in seen_in_run:
                        continue
                    seen_in_run.add(row.stable_key)
                    inserted, price_changed = _persist(db, row, run.id)
                    if inserted:
                        result.products_inserted += 1
                    else:
                        result.products_updated += 1
                    if price_changed:
                        result.price_changes_detected += 1
                    result.products_persisted += 1

                page_url = spider.next_page_url(html, page_url)
                if page_url and pages < spider.MAX_PAGES:
                    # robots.txt crawl-delay wins over our default
                    delay = robots_mod.crawl_delay(page_url, USER_AGENT) or REQUEST_DELAY_S
                    time.sleep(delay)

        db.commit()
    except Exception as exc:
        result.errors.append(f"Pipeline crashed: {exc}")

    result.duration_ms = int((time.monotonic() - started) * 1000)

    run.completed_at = datetime.now(timezone.utc)
    run.pages_fetched = result.pages_fetched
    run.pages_skipped_by_robots = result.pages_skipped_by_robots
    run.products_seen = result.products_seen
    run.products_inserted = result.products_inserted
    run.products_updated = result.products_updated
    run.products_rejected = result.products_rejected
    run.price_changes_detected = result.price_changes_detected
    run.duration_ms = result.duration_ms
    run.errors_json = _errors_blob(result)
    run.status = (
        "failed"
        if result.errors and result.products_persisted == 0
        else "success"
    )
    db.commit()

    return result


def _errors_blob(result: ScrapeRunResult) -> dict:
    return {
        "errors": result.errors,
        "row_errors": [
            {
                "page_url": e.page_url,
                "raw_external_id": e.raw_external_id,
                "field": e.field,
                "reason": e.reason,
            }
            for e in result.row_errors
        ],
    }


def _result_from_run_row(run: ScrapeRun) -> ScrapeRunResult:
    """Reconstruct a ScrapeRunResult from a persisted ScrapeRun row
    (for idempotency replay)."""
    result = ScrapeRunResult(
        source_id=run.source_id,
        pages_fetched=run.pages_fetched,
        pages_skipped_by_robots=run.pages_skipped_by_robots,
        products_seen=run.products_seen,
        products_persisted=run.products_inserted + run.products_updated,
        products_inserted=run.products_inserted,
        products_updated=run.products_updated,
        products_rejected=run.products_rejected,
        price_changes_detected=run.price_changes_detected,
        duration_ms=run.duration_ms,
    )
    blob = run.errors_json or {}
    result.errors = list(blob.get("errors", []))
    result.row_errors = [
        RowError(
            page_url=e.get("page_url", ""),
            raw_external_id=e.get("raw_external_id", ""),
            field=e.get("field", ""),
            reason=e.get("reason", ""),
        )
        for e in blob.get("row_errors", [])
    ]
    return result


# ──────────────────────────────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────────────────────────────
def _validate(row: ScrapedProduct, page_url: str) -> RowError | None:
    """Return a RowError if the row is invalid, else None."""
    if not row.title or len(row.title.strip()) < MIN_TITLE_LEN:
        return RowError(page_url, row.external_id, "title", "missing or too short")
    if len(row.title) > MAX_TITLE_LEN:
        return RowError(
            page_url,
            row.external_id,
            "title",
            f"exceeds {MAX_TITLE_LEN} chars (got {len(row.title)})",
        )
    if not row.external_id:
        return RowError(page_url, row.external_id, "external_id", "missing")
    if not row.stable_key:
        return RowError(page_url, row.external_id, "stable_key", "missing")
    if not (PRICE_MIN <= row.price <= PRICE_MAX):
        return RowError(
            page_url,
            row.external_id,
            "price",
            f"out of range [{PRICE_MIN}, {PRICE_MAX}] (got {row.price})",
        )
    return None


# ──────────────────────────────────────────────────────────────────────
# HTTP with retry + Retry-After + 429
# ──────────────────────────────────────────────────────────────────────
def _fetch_with_retry(
    client: httpx.Client,
    url: str,
    result: ScrapeRunResult,
) -> str | None:
    last_error: str | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.get(url)
            if response.status_code == 429:
                # Honor Retry-After if present, capped to MAX_RETRY_AFTER_S
                retry_after = _parse_retry_after(response.headers.get("Retry-After"))
                wait = min(retry_after, MAX_RETRY_AFTER_S) if retry_after else (
                    BACKOFF_BASE_S * (2**attempt)
                )
                result.errors.append(
                    f"429 at {url}, waiting {wait:.1f}s (Retry-After: {retry_after})",
                )
                time.sleep(wait)
                continue
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


def _parse_retry_after(header: str | None) -> float | None:
    """Retry-After may be seconds (int) or an HTTP-date. We only handle
    the seconds form — the date form is rarely sent by sites we'd scrape,
    and parsing HTTP-date is its own bug nest. Return None to fall back
    to exponential backoff."""
    if not header:
        return None
    try:
        return max(0.0, float(header.strip()))
    except (ValueError, TypeError):
        return None


# ──────────────────────────────────────────────────────────────────────
# Persistence + price-history logging
# ──────────────────────────────────────────────────────────────────────
def _persist(db: Session, row: ScrapedProduct, run_id: str) -> tuple[bool, bool]:
    """Upsert by stable_key, log price changes. Returns (was_inserted, price_changed)."""
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
            ),
        )
        # First observation — log it but no delta
        db.add(
            CompetitorPriceHistory(
                id=f"cph_{uuid.uuid4().hex[:12]}",
                stable_key=row.stable_key,
                price=row.price,
                currency=row.currency,
                observed_at=datetime.now(timezone.utc),
                delta_pct=None,
                scrape_run_id=run_id,
            ),
        )
        return True, False

    prev_price = existing.price
    price_changed = abs(prev_price - row.price) > 0.001

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

    if price_changed:
        delta_pct = ((row.price - prev_price) / prev_price * 100) if prev_price > 0 else None
        db.add(
            CompetitorPriceHistory(
                id=f"cph_{uuid.uuid4().hex[:12]}",
                stable_key=row.stable_key,
                price=row.price,
                currency=row.currency,
                observed_at=datetime.now(timezone.utc),
                delta_pct=round(delta_pct, 2) if delta_pct is not None else None,
                scrape_run_id=run_id,
            ),
        )

    return False, price_changed


def run_with_fixture_html(
    db: Session,
    source_id: str,
    pages: Iterable[tuple[str, str]],
) -> ScrapeRunResult:
    """Test-only — same path minus the network. Robots is skipped (no
    network), validation still runs, price-history still logged."""
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

    seen: set[str] = set()
    for page_url, html in pages:
        result.pages_fetched += 1
        for row in spider.parse(html, page_url):
            result.products_seen += 1
            err = _validate(row, page_url)
            if err is not None:
                result.row_errors.append(err)
                result.products_rejected += 1
                continue
            if row.stable_key in seen:
                continue
            seen.add(row.stable_key)
            inserted, price_changed = _persist(db, row, run.id)
            if inserted:
                result.products_inserted += 1
            else:
                result.products_updated += 1
            if price_changed:
                result.price_changes_detected += 1
            result.products_persisted += 1
    db.commit()
    result.duration_ms = int((time.monotonic() - started) * 1000)

    run.completed_at = datetime.now(timezone.utc)
    run.pages_fetched = result.pages_fetched
    run.products_seen = result.products_seen
    run.products_inserted = result.products_inserted
    run.products_updated = result.products_updated
    run.products_rejected = result.products_rejected
    run.price_changes_detected = result.price_changes_detected
    run.duration_ms = result.duration_ms
    run.errors_json = _errors_blob(result)
    run.status = "success" if result.products_persisted > 0 else "failed"
    db.commit()
    return result
