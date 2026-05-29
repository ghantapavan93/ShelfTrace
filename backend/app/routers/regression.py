from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RegressionCase, RegressionCaseType
from app.schemas import (
    RegressionCaseCreateIn,
    RegressionCaseView,
    RegressionReplayResult,
)
from app.security import Identity, require_operator
from app.services import regression

router = APIRouter(prefix="/api/v1", tags=["regression"])


def _case_view(case: RegressionCase) -> RegressionCaseView:
    return RegressionCaseView(
        id=case.id,
        case_type=case.case_type.value,
        title=case.title,
        origin_incident_id=case.origin_incident_id,
        origin_action_id=case.origin_action_id,
        sku=case.sku,
        store_id=case.store_id,
        channel=case.channel,
        expected_behavior=case.expected_behavior,
        failure_signature=case.failure_signature,
        status=case.status.value,
        created_at=case.created_at,
        last_replayed_at=case.last_replayed_at,
    )


@router.get("/regression-cases", response_model=list[RegressionCaseView])
def list_regression_cases(db: Session = Depends(get_db)):
    """Every saved Override Memory / regression case, newest first."""
    return [_case_view(c) for c in regression.list_cases(db)]


@router.get("/regression-cases/{case_id}", response_model=RegressionCaseView)
def get_regression_case(case_id: str, db: Session = Depends(get_db)):
    case = regression.get_case(db, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Regression case not found")
    return _case_view(case)


@router.post("/incidents/{incident_id}/create-regression-case", response_model=RegressionCaseView)
def create_regression_case(
    incident_id: str,
    payload: RegressionCaseCreateIn | None = None,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    """Capture a durable regression case from a resolved/recovered incident.

    Idempotent: re-capturing the same incident returns the existing case.
    """
    override: RegressionCaseType | None = None
    if payload is not None and payload.case_type:
        try:
            override = RegressionCaseType(payload.case_type)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Unknown case_type '{payload.case_type}'")
    try:
        case = regression.create_from_incident(db, incident_id, case_type=override)
    except regression.RegressionError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _case_view(case)


@router.post("/regression-cases/{case_id}/replay", response_model=RegressionReplayResult)
def replay_regression_case(
    case_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    """Re-exercise the case's failure signature through the shared certification
    engine and record the outcome (marks the case REPLAYED)."""
    try:
        result = regression.replay_as_certification(db, case_id)
    except regression.RegressionError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return RegressionReplayResult(**result)
