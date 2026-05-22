from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PriceAction, PriceBatch
from app.routers.common import get_batch_or_404
from app.schemas import OperationsOverview
from app.services import queries

router = APIRouter(prefix="/api/v1", tags=["operations"])


@router.get("/operations", response_model=OperationsOverview)
def operations(external_id: str | None = None, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, external_id)
    return queries.operations_overview(db, batch)


@router.get("/markdowns")
def markdowns(external_id: str | None = None, db: Session = Depends(get_db)):
    batch = get_batch_or_404(db, external_id)
    canary = set(next((g.store_ids for g in batch.rollout_groups if g.kind == "canary"), []))
    rows = [
        a for a in batch.actions if a.is_perishable and a.markdown_deadline and a.store_id in canary
    ]
    out = []
    for a in sorted(rows, key=lambda x: x.store_id):
        out.append(
            {
                "action": queries.action_view(a).model_dump(),
                "markdown_deadline": a.markdown_deadline,
            }
        )
    return {"zone": batch.zone, "markdowns": out}
