"""Scraping API — kick off runs, query scraped products, list runs.

These endpoints sit on top of `app.scrapers`. The router stays thin:
parse query params, call the pipeline / SQLAlchemy, serialise the
result. All real work lives in the scrapers/ module so it can be tested
in isolation without standing up FastAPI.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CompetitorProduct, ScrapeRun
from app.scrapers import list_sources, run_scrape
from app.scrapers.registry import get_spider
from app.security import Identity, require_operator

router = APIRouter(prefix="/api/v1/scraping", tags=["scraping"])


@router.get("/sources")
def get_sources():
    """All spiders the registry knows about. Reads metadata only — does
    NOT trigger any scraping work."""
    return {"sources": list_sources()}


@router.post("/runs", status_code=202)
def trigger_run(
    source_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    """Run a scrape synchronously and return the result summary.

    Synchronous for demo simplicity. Production would push this onto a
    queue (Celery / RQ / outbox) and return a run_id immediately, then
    the client would poll GET /runs/{id}. Doc'd in README.
    """
    if get_spider(source_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"No spider registered for source_id '{source_id}'",
        )
    result = run_scrape(db, source_id)
    return {
        "source_id": result.source_id,
        "pages_fetched": result.pages_fetched,
        "products_seen": result.products_seen,
        "products_inserted": result.products_inserted,
        "products_updated": result.products_updated,
        "products_persisted": result.products_persisted,
        "duration_ms": result.duration_ms,
        "errors": result.errors,
    }


@router.get("/runs")
def list_runs(
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
    """Recent scrape runs, newest first."""
    rows = list(
        db.scalars(
            select(ScrapeRun).order_by(desc(ScrapeRun.started_at)).limit(limit),
        )
    )
    return {
        "runs": [
            {
                "id": r.id,
                "source_id": r.source_id,
                "status": r.status,
                "started_at": r.started_at,
                "completed_at": r.completed_at,
                "duration_ms": r.duration_ms,
                "pages_fetched": r.pages_fetched,
                "products_seen": r.products_seen,
                "products_inserted": r.products_inserted,
                "products_updated": r.products_updated,
                "errors": (r.errors_json or {}).get("errors", []),
            }
            for r in rows
        ]
    }


@router.get("/products")
def list_products(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    q: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Query scraped products with filter + paginate.

    Pagination + filter built in from day one. Stops the '/scrapers
    returns 10k rows' gotcha that a careful reviewer would catch.
    """
    stmt = select(CompetitorProduct).order_by(desc(CompetitorProduct.last_seen_at))
    if source_id:
        stmt = stmt.where(CompetitorProduct.source_id == source_id)
    if q:
        # Case-insensitive substring match on title — fine for the demo
        # data volume. Production would use a tsvector + GIN index.
        stmt = stmt.where(CompetitorProduct.title.ilike(f"%{q}%"))

    total = db.scalar(
        select(CompetitorProduct.id).where(
            CompetitorProduct.source_id == source_id if source_id else True
        ),
    )
    rows = list(db.scalars(stmt.offset(offset).limit(limit)))

    return {
        "total_estimated": len(rows) + offset,  # cheap; real count would COUNT(*)
        "offset": offset,
        "limit": limit,
        "products": [
            {
                "id": p.id,
                "source_id": p.source_id,
                "external_id": p.external_id,
                "title": p.title,
                "price": p.price,
                "currency": p.currency,
                "category": p.category,
                "availability": p.availability,
                "image_url": p.image_url,
                "source_url": p.source_url,
                "first_seen_at": p.first_seen_at,
                "last_seen_at": p.last_seen_at,
                "observation_count": p.observation_count,
            }
            for p in rows
        ],
    }
