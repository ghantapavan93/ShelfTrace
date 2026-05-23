from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import CertificationRun, ConnectorProfile, PriceBatch
from app.schemas import (
    CertificationCheckView,
    CertificationReport,
    ConnectorProfileView,
)
from app.security import Identity, require_operator
from app.services import certification

router = APIRouter(prefix="/api/v1/certification", tags=["certification"])


def _profile_view(p: ConnectorProfile) -> ConnectorProfileView:
    return ConnectorProfileView(
        id=p.id,
        name=p.name,
        retailer_name=p.retailer_name,
        pos_provider=p.pos_provider,
        esl_provider=p.esl_provider,
        ecommerce_provider=p.ecommerce_provider,
        status=p.status.value,
        created_at=p.created_at,
    )


def _build_report(db: Session, run: CertificationRun) -> CertificationReport:
    profile = db.get(ConnectorProfile, run.connector_profile_id)
    checks = sorted(run.checks, key=lambda c: c.created_at)
    batch = db.get(PriceBatch, run.batch_id) if run.batch_id else None

    check_views = [
        CertificationCheckView(
            id=c.id,
            check_type=c.check_type.value,
            scenario_name=c.scenario_name,
            status=c.status.value,
            evidence=json.loads(c.evidence_json),
            created_at=c.created_at,
        )
        for c in checks
    ]
    summary = {
        "total": len(check_views),
        "passed": sum(1 for c in checks if c.status.value == "passed"),
        "recovered": sum(1 for c in checks if c.status.value == "recovered"),
        "failed": sum(1 for c in checks if c.status.value == "failed"),
    }
    return CertificationReport(
        run_id=run.id,
        status=run.status.value,
        final_recommendation=run.final_recommendation,
        started_at=run.started_at,
        completed_at=run.completed_at,
        batch_external_id=batch.external_id if batch else None,
        connector=_profile_view(profile),
        checks=check_views,
        summary=summary,
    )


def _get_run_or_404(db: Session, run_id: str) -> CertificationRun:
    run = certification.get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Certification run not found")
    return run


@router.post("/demo/reset", response_model=CertificationReport)
def reset(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    if not settings.demo_mode:
        raise HTTPException(status_code=403, detail="Demo mode disabled")
    run = certification.reset_demo(db)
    return _build_report(db, run)


@router.post("/runs", response_model=CertificationReport, status_code=201)
def create_run(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    run = certification.create_run(db, execute_now=True)
    return _build_report(db, run)


@router.get("/current", response_model=CertificationReport)
def current(db: Session = Depends(get_db)):
    run = certification.latest_run(db)
    if run is None:
        raise HTTPException(status_code=404, detail="No certification run yet")
    return _build_report(db, run)


@router.get("/runs/{run_id}", response_model=CertificationReport)
def get_run(run_id: str, db: Session = Depends(get_db)):
    return _build_report(db, _get_run_or_404(db, run_id))


@router.get("/runs/{run_id}/report", response_model=CertificationReport)
def get_report(run_id: str, db: Session = Depends(get_db)):
    return _build_report(db, _get_run_or_404(db, run_id))


@router.post("/runs/{run_id}/execute", response_model=CertificationReport)
def execute(
    run_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    run = certification.execute_run(db, _get_run_or_404(db, run_id))
    return _build_report(db, run)


@router.post("/runs/{run_id}/rerun-failed-checks", response_model=CertificationReport)
def rerun_failed(
    run_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_operator),
):
    run = certification.rerun_failed_checks(db, _get_run_or_404(db, run_id))
    return _build_report(db, run)
