"""Tests for the scraper subsystem.

Covers:
  • books_demo spider parser against a deterministic HTML fixture
  • Pipeline dedup within a run (same stable_key seen twice)
  • Pipeline upsert across runs (existing row gets last_seen + count bump)
  • Registry resolution + unknown source handling
  • Pagination (next_page_url extraction)
  • ScrapeRun row recorded with final status + duration

The fixture HTML is a minimal but faithful copy of one books.toscrape.com
catalogue page — enough markup to exercise every selector the spider
relies on, without depending on live network during CI.
"""
from __future__ import annotations

from sqlalchemy import select

from app.models import CompetitorProduct, ScrapeRun
from app.scrapers import run_scrape  # noqa: F401 — keeps public surface honest
from app.scrapers.pipeline import _persist, run_with_fixture_html
from app.scrapers.registry import get_spider, list_sources
from app.scrapers.spiders.books_demo import BooksDemoSpider


# ──────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────
FIXTURE_PAGE_URL = "https://books.toscrape.com/catalogue/page-1.html"

FIXTURE_HTML = """
<html><body>
<section>
  <article class="product_pod">
    <div class="image_container">
      <a href="a-light-in-the-attic_1000/index.html">
        <img src="../media/cache/2c/72/2c72a3b96f9d2dfb6c4f73a3a4ceac20.jpg"/>
      </a>
    </div>
    <p class="star-rating Three"></p>
    <h3><a href="a-light-in-the-attic_1000/index.html" title="A Light in the Attic">A Light in the Attic</a></h3>
    <div class="product_price">
      <p class="price_color">£51.77</p>
      <p class="instock availability">In stock</p>
    </div>
  </article>
  <article class="product_pod">
    <div class="image_container">
      <a href="tipping-the-velvet_999/index.html">
        <img src="../media/cache/26/0c/260ce8c91e9a9b13d5fdb6e2c7ce1f9b.jpg"/>
      </a>
    </div>
    <p class="star-rating One"></p>
    <h3><a href="tipping-the-velvet_999/index.html" title="Tipping the Velvet">Tipping the Velvet</a></h3>
    <div class="product_price">
      <p class="price_color">£53.74</p>
      <p class="instock availability">In stock</p>
    </div>
  </article>
</section>
<ul class="pager">
  <li class="next"><a href="page-2.html">next</a></li>
</ul>
</body></html>
"""

FIXTURE_PAGE_2 = """
<html><body>
<article class="product_pod">
  <h3><a href="soumission_998/index.html" title="Soumission">Soumission</a></h3>
  <div class="product_price">
    <p class="price_color">£50.10</p>
    <p class="instock availability">Out of stock</p>
  </div>
</article>
</body></html>
"""


# ──────────────────────────────────────────────────────────────────────
# Parser-level tests (no DB)
# ──────────────────────────────────────────────────────────────────────
def test_parser_extracts_all_products_from_fixture():
    rows = list(BooksDemoSpider.parse(FIXTURE_HTML, FIXTURE_PAGE_URL))
    assert len(rows) == 2

    light = rows[0]
    assert light.title == "A Light in the Attic"
    assert light.price == 51.77
    assert light.currency == "GBP"
    assert light.availability == "in_stock"
    assert light.external_id == "a-light-in-the-attic_1000"
    assert light.stable_key == "books_demo:a-light-in-the-attic_1000"
    assert light.image_url and light.image_url.endswith(".jpg")
    assert light.source_url and "a-light-in-the-attic" in light.source_url
    assert light.raw_attributes == {"rating": 3}


def test_parser_handles_out_of_stock():
    rows = list(BooksDemoSpider.parse(FIXTURE_PAGE_2, FIXTURE_PAGE_URL))
    assert rows[0].availability == "out_of_stock"


def test_parser_finds_next_page_url():
    next_url = BooksDemoSpider.next_page_url(FIXTURE_HTML, FIXTURE_PAGE_URL)
    assert next_url and next_url.endswith("page-2.html")


def test_parser_returns_none_when_no_pagination():
    next_url = BooksDemoSpider.next_page_url(FIXTURE_PAGE_2, FIXTURE_PAGE_URL)
    assert next_url is None


# ──────────────────────────────────────────────────────────────────────
# Pipeline + DB tests
# ──────────────────────────────────────────────────────────────────────
def test_pipeline_persists_parsed_products(db):
    result = run_with_fixture_html(
        db,
        "books_demo",
        [(FIXTURE_PAGE_URL, FIXTURE_HTML)],
    )
    assert result.products_persisted == 2
    assert result.products_inserted == 2
    assert result.products_updated == 0
    rows = list(db.scalars(select(CompetitorProduct)))
    assert {r.title for r in rows} == {"A Light in the Attic", "Tipping the Velvet"}


def test_pipeline_dedupes_within_a_run(db):
    # Same HTML repeated twice in one run — second occurrence must NOT
    # double-count or double-insert.
    result = run_with_fixture_html(
        db,
        "books_demo",
        [
            (FIXTURE_PAGE_URL, FIXTURE_HTML),
            (FIXTURE_PAGE_URL + "?dup", FIXTURE_HTML),
        ],
    )
    assert result.products_seen == 4  # we *saw* 4 raw rows
    assert result.products_persisted == 2  # but only 2 unique stable_keys
    assert result.products_inserted == 2


def test_pipeline_upserts_across_runs_and_bumps_observation_count(db):
    # First run inserts
    run_with_fixture_html(
        db,
        "books_demo",
        [(FIXTURE_PAGE_URL, FIXTURE_HTML)],
    )
    # Second run sees the same products — should update, not insert
    result2 = run_with_fixture_html(
        db,
        "books_demo",
        [(FIXTURE_PAGE_URL, FIXTURE_HTML)],
    )
    assert result2.products_inserted == 0
    assert result2.products_updated == 2

    # observation_count should have been bumped to 2
    row = db.scalar(
        select(CompetitorProduct).where(
            CompetitorProduct.stable_key == "books_demo:a-light-in-the-attic_1000",
        ),
    )
    assert row is not None
    assert row.observation_count == 2


def test_upsert_refreshes_price_on_change(db):
    # Insert at £51.77
    run_with_fixture_html(
        db,
        "books_demo",
        [(FIXTURE_PAGE_URL, FIXTURE_HTML)],
    )
    # Re-run with a tweaked HTML showing a price change
    modified = FIXTURE_HTML.replace("£51.77", "£49.99")
    run_with_fixture_html(
        db,
        "books_demo",
        [(FIXTURE_PAGE_URL, modified)],
    )
    row = db.scalar(
        select(CompetitorProduct).where(
            CompetitorProduct.stable_key == "books_demo:a-light-in-the-attic_1000",
        ),
    )
    assert row.price == 49.99
    assert row.observation_count == 2


# ──────────────────────────────────────────────────────────────────────
# Registry tests
# ──────────────────────────────────────────────────────────────────────
def test_registry_resolves_known_source():
    spider = get_spider("books_demo")
    assert spider is BooksDemoSpider


def test_registry_returns_none_for_unknown_source():
    assert get_spider("does-not-exist") is None


def test_list_sources_returns_serialisable_metadata():
    sources = list_sources()
    assert len(sources) >= 1
    first = sources[0]
    assert {"source_id", "name", "description", "start_url", "max_pages"} <= set(first.keys())
    # The grocery storefront leads the registry (most representative source for
    # a grocery pricing control plane); the books reference source follows.
    assert first["source_id"] == "fresh_market_demo"
    assert "books_demo" in {s["source_id"] for s in sources}


# ──────────────────────────────────────────────────────────────────────
# Run lifecycle tests — uses real run_scrape via monkeypatched httpx
# ──────────────────────────────────────────────────────────────────────
def test_run_scrape_records_scrape_run_row(db, monkeypatch):
    """The end-to-end run path writes a ScrapeRun row with the summary."""
    import httpx

    # Stub httpx.Client.get so we don't hit the network in tests
    pages = {
        BooksDemoSpider.START_URL: FIXTURE_HTML,
        # next_page_url resolves to https://books.toscrape.com/catalogue/page-2.html
        "https://books.toscrape.com/catalogue/page-2.html": FIXTURE_PAGE_2,
    }

    class _Resp:
        def __init__(self, text: str, status_code: int = 200):
            self.text = text
            self.status_code = status_code

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError(
                    "boom", request=None, response=self,  # type: ignore[arg-type]
                )

    def fake_get(self, url, **kwargs):  # noqa: ARG001
        return _Resp(pages.get(url, ""), 200 if url in pages else 404)

    monkeypatch.setattr(httpx.Client, "get", fake_get)
    # Skip the polite 1-second sleep so the test stays snappy
    from app.scrapers import pipeline as scraper_pipeline
    monkeypatch.setattr(scraper_pipeline, "REQUEST_DELAY_S", 0)

    result = run_scrape(db, "books_demo")

    assert result.pages_fetched == 2  # got both fixture pages before next_page_url returns None
    assert result.products_persisted == 3

    runs = list(db.scalars(select(ScrapeRun)))
    assert len(runs) == 1
    run = runs[0]
    assert run.status == "success"
    assert run.products_inserted == 3
    assert run.completed_at is not None
    assert run.duration_ms >= 0


def test_unknown_source_returns_error_in_result():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        result = run_scrape(db, "does-not-exist")
        assert result.products_persisted == 0
        assert any("Unknown source_id" in e for e in result.errors)
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────
# Per-row validation
# ──────────────────────────────────────────────────────────────────────
def test_pipeline_rejects_rows_with_zero_price(db):
    bad_html = """
    <article class="product_pod">
      <h3><a href="zero-priced_1/index.html" title="Zero Priced">Zero Priced</a></h3>
      <p class="price_color">£0.00</p>
      <p class="availability">In stock</p>
    </article>
    """
    result = run_with_fixture_html(db, "books_demo", [(FIXTURE_PAGE_URL, bad_html)])
    assert result.products_rejected == 1
    assert result.products_persisted == 0
    assert any("price" in re.field for re in result.row_errors)


def test_pipeline_captures_per_row_rejection_details(db):
    bad_html = """
    <article class="product_pod">
      <h3><a href="x_1/index.html" title="">A</a></h3>
      <p class="price_color">£5.00</p>
    </article>
    """
    result = run_with_fixture_html(db, "books_demo", [(FIXTURE_PAGE_URL, bad_html)])
    assert result.products_rejected == 1
    err = result.row_errors[0]
    assert err.field == "title"
    assert "short" in err.reason or "missing" in err.reason
    assert err.page_url == FIXTURE_PAGE_URL


# ──────────────────────────────────────────────────────────────────────
# Price history
# ──────────────────────────────────────────────────────────────────────
def test_first_scrape_writes_baseline_price_history(db):
    from app.models import CompetitorPriceHistory
    from sqlalchemy import select as _select

    run_with_fixture_html(db, "books_demo", [(FIXTURE_PAGE_URL, FIXTURE_HTML)])
    rows = list(db.scalars(_select(CompetitorPriceHistory)))
    assert len(rows) == 2  # one per product on the page
    # First observation: delta_pct is None (no prior)
    assert all(r.delta_pct is None for r in rows)


def test_price_change_appends_history_row_with_delta(db):
    from app.models import CompetitorPriceHistory
    from sqlalchemy import select as _select

    run_with_fixture_html(db, "books_demo", [(FIXTURE_PAGE_URL, FIXTURE_HTML)])
    modified = FIXTURE_HTML.replace("£51.77", "£44.99")  # -13%
    result = run_with_fixture_html(db, "books_demo", [(FIXTURE_PAGE_URL, modified)])

    assert result.price_changes_detected == 1

    # Get the price-history rows for the changed product, newest first
    rows = list(
        db.scalars(
            _select(CompetitorPriceHistory)
            .where(CompetitorPriceHistory.stable_key == "books_demo:a-light-in-the-attic_1000")
            .order_by(CompetitorPriceHistory.observed_at.desc())
        ),
    )
    assert len(rows) == 2
    latest = rows[0]
    assert latest.price == 44.99
    assert latest.delta_pct is not None
    assert -15 < latest.delta_pct < -10  # -13ish %


def test_unchanged_price_does_not_add_history_row(db):
    from app.models import CompetitorPriceHistory
    from sqlalchemy import select as _select

    run_with_fixture_html(db, "books_demo", [(FIXTURE_PAGE_URL, FIXTURE_HTML)])
    # Same HTML again — no price change
    result = run_with_fixture_html(db, "books_demo", [(FIXTURE_PAGE_URL, FIXTURE_HTML)])
    assert result.price_changes_detected == 0
    rows = list(db.scalars(_select(CompetitorPriceHistory)))
    assert len(rows) == 2  # still just the baseline from first run


# ──────────────────────────────────────────────────────────────────────
# Idempotency
# ──────────────────────────────────────────────────────────────────────
def test_idempotency_key_returns_existing_run_summary(db, monkeypatch):
    """Second call with the same idempotency_key must NOT trigger a
    second network round-trip — it must return the prior run's summary."""
    import httpx
    from app.scrapers import pipeline as scraper_pipeline

    pages = {
        BooksDemoSpider.START_URL: FIXTURE_HTML,
        "https://books.toscrape.com/catalogue/page-2.html": FIXTURE_PAGE_2,
    }

    class _Resp:
        def __init__(self, text="", status_code=200):
            self.text = text
            self.status_code = status_code
            self.headers = {}

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("err", request=None, response=self)  # type: ignore[arg-type]

    call_count = {"n": 0}

    def fake_get(self, url, **kwargs):  # noqa: ARG001
        call_count["n"] += 1
        return _Resp(pages.get(url, ""), 200 if url in pages else 404)

    monkeypatch.setattr(httpx.Client, "get", fake_get)
    monkeypatch.setattr(scraper_pipeline, "REQUEST_DELAY_S", 0)
    # Skip robots.txt by always allowing
    from app.scrapers import robots as robots_mod
    monkeypatch.setattr(robots_mod, "can_fetch", lambda *a, **kw: True)

    r1 = run_scrape(db, "books_demo", idempotency_key="evaluator-test-001")
    first_calls = call_count["n"]
    r2 = run_scrape(db, "books_demo", idempotency_key="evaluator-test-001")
    second_calls = call_count["n"]

    # Second run made NO additional HTTP calls
    assert second_calls == first_calls
    # And returned the same summary
    assert r2.products_persisted == r1.products_persisted
    assert r2.products_inserted == r1.products_inserted


# ──────────────────────────────────────────────────────────────────────
# robots.txt enforcement
# ──────────────────────────────────────────────────────────────────────
def test_robots_blocks_disallowed_page(db, monkeypatch):
    from app.scrapers import pipeline as scraper_pipeline
    from app.scrapers import robots as robots_mod

    monkeypatch.setattr(scraper_pipeline, "REQUEST_DELAY_S", 0)
    monkeypatch.setattr(robots_mod, "can_fetch", lambda *a, **kw: False)

    result = run_scrape(db, "books_demo")
    assert result.pages_skipped_by_robots == 1
    assert result.products_persisted == 0
    assert any("robots.txt" in e for e in result.errors)


# ──────────────────────────────────────────────────────────────────────
# 429 Retry-After handling
# ──────────────────────────────────────────────────────────────────────
def test_429_response_honored_then_succeeds(db, monkeypatch):
    import httpx
    from app.scrapers import pipeline as scraper_pipeline
    from app.scrapers import robots as robots_mod

    monkeypatch.setattr(scraper_pipeline, "REQUEST_DELAY_S", 0)
    monkeypatch.setattr(robots_mod, "can_fetch", lambda *a, **kw: True)

    class _Resp:
        def __init__(self, text="", status_code=200, headers=None):
            self.text = text
            self.status_code = status_code
            self.headers = headers or {}

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("err", request=None, response=self)  # type: ignore[arg-type]

    call_seq = [
        _Resp(status_code=429, headers={"Retry-After": "0"}),  # first call: 429
        _Resp(text=FIXTURE_HTML, status_code=200),              # retry: 200
        _Resp(status_code=404),                                  # next_page: 404
    ]

    def fake_get(self, url, **kwargs):  # noqa: ARG001
        return call_seq.pop(0) if call_seq else _Resp(status_code=404)

    monkeypatch.setattr(httpx.Client, "get", fake_get)

    result = run_scrape(db, "books_demo")
    # We retried past the 429 and got the page
    assert result.products_persisted == 2
    # The 429 was recorded in errors
    assert any("429" in e for e in result.errors)
