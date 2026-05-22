from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import PriceBatch
from app.routers import batches, demo, engineering, incidents, operations
from app.seed import seed_demo

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
app.include_router(demo.router)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    if settings.demo_mode:
        with SessionLocal() as db:
            existing = db.scalar(select(PriceBatch))
            if existing is None:
                logger.info("Demo mode: seeding Memorial Day / Dallas Zone 2 batch")
                seed_demo(db)


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
