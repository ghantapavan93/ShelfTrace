from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas import BatchSummary
from app.security import Identity, require_operator
from app.seed import seed_live
from app.services import queries, scenarios

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])


@router.post("/reset", response_model=BatchSummary)
def reset(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    """Reset the live-rollout demo to its blocked state (certification untouched).

    Restores BOTH seeded live scenarios and re-runs Organic Whole Milk LAST so it
    is the freshest live-rollout batch — i.e. the primary hero the operations view
    defaults to — and returns it as the reset target. Mirrors the boot order in
    main.py so a mid-demo reset lands on the milk POS-mismatch story, not Memorial Day.
    """
    if not settings.demo_mode:
        raise HTTPException(status_code=403, detail="Demo mode disabled")
    seed_live(db)  # Memorial Day live-rollout demo (secondary scenario)
    milk_config = scenarios.ensure_milk_hero(db)
    milk_batch = scenarios.execute_live(db, milk_config)
    return queries.batch_summary(db, milk_batch)
