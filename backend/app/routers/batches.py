from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PriceBatch
from app.routers.common import get_batch_or_404
from app.schemas import BatchDetail, BatchSummary, PriceBatchIn
from app.security import Identity, require_operator
from app.services import orchestrator, queries
from app.services.ingestion import ingest_batch

router = APIRouter(prefix="/api/v1", tags=["batches"])


@router.post("/price-batches", response_model=BatchSummary, status_code=202)
def create_batch(
    payload: PriceBatchIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    result = ingest_batch(db, payload)
    # Single-node demo: drain the outbox inline so results are immediately visible.
    orchestrator.drain(db)
    db.refresh(result.batch)
    return queries.batch_summary(db, result.batch)


@router.get("/batches", response_model=list[BatchSummary])
def list_batches(db: Session = Depends(get_db)):
    batches = list(db.scalars(select(PriceBatch).order_by(PriceBatch.created_at.desc())))
    return [queries.batch_summary(db, b) for b in batches]


@router.get("/batches/{external_id}", response_model=BatchDetail)
def get_batch(external_id: str, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, external_id)
    return queries.batch_detail(db, batch)


@router.get("/batches/{external_id}/audit")
def get_batch_audit(external_id: str, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, external_id)
    return queries.recent_audit(db, batch.id, limit=100)


@router.post("/batches/{external_id}/expand", response_model=BatchSummary)
def expand_batch(
    external_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    batch = get_batch_or_404(db, external_id)
    try:
        orchestrator.expand_batch(db, batch, actor=identity.actor)
    except orchestrator.ExpansionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return queries.batch_summary(db, batch)
