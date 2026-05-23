from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.db_migrate import run_migrations
from app.models import ConnectorProfile, PriceBatch, RunMode
from app.routers import batches, certification, demo, engineering, incidents, operations, scenarios
from app.security import auth_enabled
from app.seed import seed_live
from app.services import certification as cert_service
from app.services import scenarios as scenario_service

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger("shelftrace")


def _provision_schema() -> None:
    """Bring the schema up to date.

    Two paths:
      • USE_ALEMBIC=true  → run ``alembic upgrade head`` programmatically.
                            This is the path for real deployments — versioned,
                            reversible, auditable.
      • USE_ALEMBIC=false → fall back to ``create_all`` + the lightweight
                            additive migrations module. This is the path for
                            the demo and the test suite (which both expect
                            schema to materialise from the model metadata).
    """
    if settings.use_alembic:
        try:
            from alembic import command
            from alembic.config import Config as AlembicConfig
        except ImportError:  # pragma: no cover - install-time misconfig
            logger.error(
                "USE_ALEMBIC=true but alembic is not installed; falling back to create_all"
            )
            Base.metadata.create_all(bind=engine)
            run_migrations()
            return
        cfg = AlembicConfig("alembic.ini")
        cfg.set_main_option("sqlalchemy.url", settings.database_url)
        logger.info("Running Alembic migrations to head")
        command.upgrade(cfg, "head")
    else:
        Base.metadata.create_all(bind=engine)
        run_migrations()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _provision_schema()
    if auth_enabled():
        logger.info("API-key auth ENABLED (mutating endpoints require operator role)")
    else:
        logger.warning(
            "API-key auth DISABLED — set API_KEYS_JSON to enable. "
            "Safe for the demo; unsafe for public deployments."
        )
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
    yield
    # No teardown work for now.


app = FastAPI(
    title="ShelfTrace Control Plane",
    description="Canary rollout, execution reconciliation, and incident recovery for "
    "AI-approved grocery price changes.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — explicit allowlist replaces the prior wildcard. Browsers reject the
# combination of `*` + `allow_credentials=True`, so the previous config was both
# a spec violation and a security gap. Allowlist defaults to localhost:3000 (the
# Next.js dev server); override via CORS_ORIGINS env var (comma-separated).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Actor-Name", "Authorization"],
)

app.include_router(batches.router)
app.include_router(operations.router)
app.include_router(incidents.router)
app.include_router(engineering.router)
app.include_router(certification.router)
app.include_router(scenarios.router)
app.include_router(demo.router)


def _check_db() -> tuple[bool, str | None]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:  # pragma: no cover - liveness probe
        return False, str(exc)[:200]


def _check_redis() -> tuple[bool, str | None]:
    """Best-effort Redis ping. Returns (ok, error). The redis package is a
    declared dependency; if the broker is down we surface it in /health."""
    try:
        import redis  # noqa: WPS433

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1.0)
        client.ping()
        return True, None
    except Exception as exc:  # pragma: no cover - liveness probe
        return False, str(exc)[:200]


@app.get("/health")
def health(response: Response):
    """Deeper than `{status: ok}` — actually probes both the DB and the broker.
    Returns 503 if either dependency is unhealthy so reverse proxies and load
    balancers can route around broken pods."""
    db_ok, db_err = _check_db()
    redis_ok, redis_err = _check_redis()
    ok = db_ok and redis_ok
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "healthy" if ok else "degraded",
        "service": "shelftrace-control-plane",
        "demo_mode": settings.demo_mode,
        "auth_enabled": auth_enabled(),
        "dependencies": {
            "database": {"ok": db_ok, "error": db_err},
            "redis": {"ok": redis_ok, "error": redis_err},
        },
    }


@app.get("/")
def root():
    return {"message": "ShelfTrace Control Plane API", "docs": "/docs"}
