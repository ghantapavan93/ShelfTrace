from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditEvent, Incident, PriceBatch, RunMode
from app.schemas import (
    AuditEventView,
    IncidentExplanation,
    IncidentView,
    StoreTaskView,
)
from app.scope import Scope, apply_filter, current_scope
from app.security import Identity, require_operator
from app.services import queries, recovery

router = APIRouter(prefix="/api/v1", tags=["incidents"])


def _get_incident(db: Session, incident_id: str) -> Incident:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.get("/incidents", response_model=list[IncidentView])
def list_incidents(
    run_mode: str = "live_rollout",
    scope: str | None = Query(
        None,
        description="Data scope: 'live' (user uploads only), 'demo' (seeded only), 'all'. "
        "Applied to the batch lookup so older demo/cert incidents stay out of Live mode.",
    ),
    db: Session = Depends(get_db),
):
    """Incidents for the most recent batch in the requested scope.

    Two-level scoping:
      • Batch selection respects ?scope= — Live mode picks the most recent
        user-uploaded batch, not the latest demo seed.
      • Incident filtering then runs WITHIN that batch.

    Result: Live-mode users with no live batches yet see an empty list
    (and the frontend's clean-slate empty state), not the Memorial Day
    eggs critical incident from the seed.
    """
    resolved = current_scope(scope)
    stmt = (
        select(PriceBatch)
        .where(PriceBatch.run_mode == RunMode(run_mode))
        .order_by(PriceBatch.created_at.desc())
    )
    stmt = apply_filter(stmt, PriceBatch.source_run_id, resolved)
    current = db.scalar(stmt)
    if current is None:
        return []
    incidents = list(
        db.scalars(
            select(Incident)
            .where(Incident.batch_id == current.id)
            .order_by(Incident.created_at.desc())
        )
    )
    return [queries.incident_view(db, i) for i in incidents]


@router.get("/incidents/{incident_id}", response_model=IncidentView)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    return queries.incident_view(db, _get_incident(db, incident_id))


@router.get("/incidents/{incident_id}/explanation", response_model=IncidentExplanation)
def get_explanation(incident_id: str, db: Session = Depends(get_db)):
    return queries.incident_explanation(db, _get_incident(db, incident_id))


@router.get("/incidents/{incident_id}/audit", response_model=list[AuditEventView])
def get_incident_audit(incident_id: str, db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.incident_id == incident_id)
            .order_by(AuditEvent.created_at)
        )
    )
    return [
        AuditEventView(id=r.id, event=r.event, detail=r.detail, actor=r.actor, created_at=r.created_at)
        for r in rows
    ]


def _recover(fn, db, incident_id, actor: str):
    try:
        return fn(db, incident_id, actor=actor)
    except recovery.RecoveryError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/incidents/{incident_id}/retry", response_model=IncidentView)
def retry(
    incident_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    incident = _recover(recovery.retry_incident, db, incident_id, identity.actor)
    return queries.incident_view(db, incident)


@router.post("/incidents/{incident_id}/rollback", response_model=IncidentView)
def rollback(
    incident_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    incident = _recover(recovery.rollback_incident, db, incident_id, identity.actor)
    return queries.incident_view(db, incident)


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentView)
def resolve(
    incident_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    incident = _recover(recovery.resolve_incident, db, incident_id, identity.actor)
    return queries.incident_view(db, incident)


@router.post("/incidents/{incident_id}/store-task", response_model=StoreTaskView)
def store_task(
    incident_id: str,
    instruction: str | None = Body(default=None, embed=True),
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    try:
        task = recovery.create_store_task(db, incident_id, instruction, actor=identity.actor)
    except recovery.RecoveryError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return StoreTaskView(
        id=task.id,
        incident_id=task.incident_id,
        store_id=task.store_id,
        instruction=task.instruction,
        status=task.status.value,
        created_at=task.created_at,
    )
