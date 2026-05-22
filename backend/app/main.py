from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.db_migrate import run_migrations
from app.models import ConnectorProfile, PriceBatch, RunMode
from app.routers import batches, certification, demo, engineering, incidents, operations, scenarios
from app.seed import seed_live
from app.services import certification as cert_service
from app.services import scenarios as scenario_service

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger("shelftrace")

app = FastAPI(
    title="ShelfTrace Control Plane",
    description="Canary rollout, execution reconciliation, and incident recovery for "
    "AI-approved grocery price changes.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(batches.router)
app.include_router(operations.router)
app.include_router(incidents.router)
app.include_router(engineering.router)
app.include_router(certification.router)
app.include_router(scenarios.router)
app.include_router(demo.router)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    run_migrations()
    if settings.demo_mode:
        with SessionLocal() as db:
            # Ensure the seeded showcase scenario configuration exists.
            scenario_service.ensure_memorial_day(db)
            live = db.scalar(select(PriceBatch).where(PriceBatch.run_mode == RunMode.LIVE_ROLLOUT))
            if live is None:
                logger.info("Demo mode: seeding live-rollout batch (Memorial Day / Dallas Zone 2)")
                seed_live(db)
            profile = db.scalar(select(ConnectorProfile))
            if profile is None:
                logger.info("Demo mode: seeding certification sandbox run")
                cert_service.reset_demo(db)


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "shelftrace-control-plane",
        "demo_mode": settings.demo_mode,
    }


@app.get("/")
def root():
    return {"message": "ShelfTrace Control Plane API", "docs": "/docs"}
