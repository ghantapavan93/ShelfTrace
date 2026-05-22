from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PriceBatch, RunMode


def get_batch_or_404(
    db: Session, external_id: str | None, run_mode: str | None = None
) -> PriceBatch:
    if external_id:
        batch = db.scalar(select(PriceBatch).where(PriceBatch.external_id == external_id))
    elif run_mode:
        batch = db.scalar(
            select(PriceBatch)
            .where(PriceBatch.run_mode == RunMode(run_mode))
            .order_by(PriceBatch.created_at.desc())
        )
    else:
        batch = db.scalar(
            select(PriceBatch)
            .where(PriceBatch.run_mode == RunMode.LIVE_ROLLOUT)
            .order_by(PriceBatch.created_at.desc())
        )
    if batch is None:
        raise HTTPException(status_code=404, detail="No batch found")
    return batch
