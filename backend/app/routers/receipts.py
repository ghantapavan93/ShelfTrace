from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Incident, PriceAction
from app.schemas import DecisionReceiptView
from app.services import receipt

router = APIRouter(prefix="/api/v1", tags=["receipts"])


@router.get("/actions/{action_id}/receipt", response_model=DecisionReceiptView)
def action_receipt(action_id: str, db: Session = Depends(get_db)):
    """The Decision Receipt for one price action — a derived, read-only evidence
    chain (Signal → Match → Approved → Certified → Published → Verified →
    Measured → Learned). No state is mutated."""
    action = db.get(PriceAction, action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    return receipt.decision_receipt(db, action)


@router.get("/incidents/{incident_id}/receipt", response_model=DecisionReceiptView)
def incident_receipt(incident_id: str, db: Session = Depends(get_db)):
    """Convenience entry point: resolve an incident to its action, then return
    that action's Decision Receipt."""
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    action = db.get(PriceAction, incident.action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Action not found")
    return receipt.decision_receipt(db, action)
