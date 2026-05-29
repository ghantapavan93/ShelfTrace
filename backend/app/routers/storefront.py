"""Synthetic competitor storefront — served by the API, scraped by the
`fresh_market_demo` spider over real HTTP.

Routes are intentionally OUTSIDE the /api/v1 namespace: this is a stand-in
"competitor website," not part of the control-plane API. A human can open
``/demo-storefront/`` in a browser to see the aisle the scraper reads.

See ``app/scrapers/storefront.py`` for the catalog + price-drift model and
``app/scrapers/spiders/fresh_market.py`` for the spider that consumes it.
"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from app.scrapers.storefront import page_count, render_catalog_page, render_item_svg

router = APIRouter(prefix="/demo-storefront", tags=["demo-storefront"])


# Handlers are async + do only fast in-memory rendering, so they're served on
# the event loop. That matters because the scrape that reads this storefront
# runs in a sync endpoint (a blocked worker thread); keeping the storefront on
# the loop means the self-scrape never contends with itself for threads.
@router.get("/", include_in_schema=False)
async def storefront_index() -> RedirectResponse:
    return RedirectResponse(url="/demo-storefront/aisle/page-1.html")


@router.get("/aisle/page-{page}.html", response_class=HTMLResponse, include_in_schema=False)
async def storefront_page(page: int) -> HTMLResponse:
    # Clamp out-of-range page numbers to the first aisle rather than 404 —
    # a scraper that miscomputes pagination should still get valid markup.
    if page < 1 or page > page_count():
        page = 1
    return HTMLResponse(content=render_catalog_page(page))


@router.get("/img/{sku}.svg", include_in_schema=False)
async def storefront_item_image(sku: str) -> Response:
    return Response(content=render_item_svg(sku), media_type="image/svg+xml")
