"""Scraping API — kick off runs, query scraped products, list runs, export CSV."""
from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CompetitorPriceHistory, CompetitorProduct, ScrapeRun
from app.scrapers import list_sources, run_scrape
from app.scrapers.registry import get_spider
from app.security import Identity, require_operator

router = APIRouter(prefix="/api/v1/scraping", tags=["scraping"])


@router.get("/sources")
def get_sources():
    return {"sources": list_sources()}


@router.post("/runs", status_code=202)
def trigger_run(
    source_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    """Run a scrape synchronously. Idempotent if `Idempotency-Key` header
    is supplied — same key returns the existing run's summary instead of
    triggering a duplicate scrape (protects targets from hammering when
    a client retries on network glitch)."""
    if get_spider(source_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"No spider registered for source_id '{source_id}'",
        )
    result = run_scrape(db, source_id, idempotency_key=idempotency_key)
    return {
        "source_id": result.source_id,
        "pages_fetched": result.pages_fetched,
        "pages_skipped_by_robots": result.pages_skipped_by_robots,
        "products_seen": result.products_seen,
        "products_inserted": result.products_inserted,
        "products_updated": result.products_updated,
        "products_rejected": result.products_rejected,
        "products_persisted": result.products_persisted,
        "price_changes_detected": result.price_changes_detected,
        "duration_ms": result.duration_ms,
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


@router.get("/runs")
def list_runs(
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
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
                "pages_skipped_by_robots": r.pages_skipped_by_robots,
                "products_seen": r.products_seen,
                "products_inserted": r.products_inserted,
                "products_updated": r.products_updated,
                "products_rejected": r.products_rejected,
                "price_changes_detected": r.price_changes_detected,
                "errors": (r.errors_json or {}).get("errors", []),
                "row_errors": (r.errors_json or {}).get("row_errors", []),
            }
            for r in rows
        ],
    }


@router.get("/products")
def list_products(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    q: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = select(CompetitorProduct).order_by(desc(CompetitorProduct.last_seen_at))
    if source_id:
        stmt = stmt.where(CompetitorProduct.source_id == source_id)
    if q:
        stmt = stmt.where(CompetitorProduct.title.ilike(f"%{q}%"))
    rows = list(db.scalars(stmt.offset(offset).limit(limit)))
    return {
        "total_returned": len(rows),
        "offset": offset,
        "limit": limit,
        "products": [_product_dict(p) for p in rows],
    }


@router.get("/products/export.csv")
def export_products_csv(
    db: Session = Depends(get_db),
    source_id: str | None = None,
    q: str | None = None,
):
    """Stream the full product set as RFC-4180 CSV — for an evaluator
    who wants the data in their own spreadsheet."""
    stmt = select(CompetitorProduct).order_by(desc(CompetitorProduct.last_seen_at))
    if source_id:
        stmt = stmt.where(CompetitorProduct.source_id == source_id)
    if q:
        stmt = stmt.where(CompetitorProduct.title.ilike(f"%{q}%"))

    def _row_stream():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "source_id", "external_id", "stable_key", "title",
                "price", "currency", "category", "availability",
                "first_seen_at", "last_seen_at", "observation_count",
                "source_url",
            ],
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate()

        for p in db.scalars(stmt):
            writer.writerow(
                [
                    p.source_id, p.external_id, p.stable_key, p.title,
                    p.price, p.currency, p.category or "", p.availability or "",
                    p.first_seen_at.isoformat() if p.first_seen_at else "",
                    p.last_seen_at.isoformat() if p.last_seen_at else "",
                    p.observation_count, p.source_url or "",
                ],
            )
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    filename = f"shelftrace-competitor-products-{datetime.utcnow():%Y%m%d-%H%M%S}.csv"
    return StreamingResponse(
        _row_stream(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/products/{stable_key:path}/history")
def product_price_history(
    stable_key: str,
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    """Append-only price history for one product. Used by the pricing
    engine downstream — competitor moves are the strongest external
    signal we have."""
    rows = list(
        db.scalars(
            select(CompetitorPriceHistory)
            .where(CompetitorPriceHistory.stable_key == stable_key)
            .order_by(desc(CompetitorPriceHistory.observed_at))
            .limit(limit),
        ),
    )
    return {
        "stable_key": stable_key,
        "observations": [
            {
                "id": r.id,
                "price": r.price,
                "currency": r.currency,
                "observed_at": r.observed_at,
                "delta_pct": r.delta_pct,
                "scrape_run_id": r.scrape_run_id,
            }
            for r in rows
        ],
    }


def _product_dict(p: CompetitorProduct) -> dict:
    return {
        "id": p.id,
        "source_id": p.source_id,
        "external_id": p.external_id,
        "stable_key": p.stable_key,
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
