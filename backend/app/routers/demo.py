from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas import BatchSummary
from app.seed import seed_demo
from app.services import queries

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])


@router.post("/reset", response_model=BatchSummary)
def reset(db: Session = Depends(get_db)):
    if not settings.demo_mode:
        raise HTTPException(status_code=403, detail="Demo mode disabled")
    batch = seed_demo(db)
    return queries.batch_summary(db, batch)
