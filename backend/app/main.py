from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.config import production_startup_errors, settings
from app.database import Base, SessionLocal, engine
from app.db_migrate import run_migrations
from app.logging_config import configure_logging
from app.middleware import RequestIDMiddleware
from app.models import ConnectorProfile, PriceBatch, RunMode, SourceDatasetType
from app.observability import setup_tracing
from app.rate_limit import get_limiter
from app.routers import batches, certification, data_replay, demo, engineering, incidents, operations, pricing, product_graph, receipts, regression, scenarios, scraping, storefront
from app.security import auth_enabled
from app.seed import ensure_realistic_scale_demo, purge_user_scope, seed_live
from app.services import certification as cert_service
from app.services import data_replay as data_replay_service
from app.services import scenarios as scenario_service

configure_logging(settings.log_level, settings.log_format)
logger = logging.getLogger("shelftrace")


def _provision_schema() -> None:
    """Bring the schema up to date.

      • USE_ALEMBIC=true  → run ``alembic upgrade head`` programmatically.
                            This is the path for real deployments — versioned,
                            reversible, auditable.
      • USE_ALEMBIC=false → fall back to ``create_all`` + the lightweight
                            additive migrations module. Path for demo + tests.
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
        # Belt-and-suspenders: create_all + additive migrations are idempotent
        # and only ADD missing tables/columns (never drop or alter). This
        # guarantees a model added without a matching Alembic revision still
        # provisions on a real deploy instead of 500-ing in production. The
        # versioned migrations remain the source of truth — this is a safety
        # net, not a replacement.
        Base.metadata.create_all(bind=engine)
        run_migrations()
    else:
        Base.metadata.create_all(bind=engine)
        run_migrations()


@asynccontextmanager
async def lifespan(app: FastAPI):
    startup_errors = production_startup_errors(settings)
    if startup_errors:
        raise RuntimeError(
            "Invalid production configuration: " + "; ".join(startup_errors)
        )
    _provision_schema()
    setup_tracing(app)
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
            # Real Data Replay: pre-import both bundled USDA fixtures (idempotent).
            try:
                data_replay_service.import_source(db, SourceDatasetType.USDA_FDC)
                data_replay_service.import_source(db, SourceDatasetType.USDA_AMS)
            except Exception:
                logger.exception("Real Data Replay fixture import skipped")
            # DEMO = full potential: the Realistic Scale catalog (150-SKU product
            # graph, competitor index, pricing recommendations, KVI watchlist,
            # margin targets, substitutes) — all demo-scoped. Idempotent: a fast
            # no-op once consistent; only (re)loads (~6s) if missing/mis-scoped.
            # Runs BEFORE the milk hero so the milk POS-mismatch batch stays the
            # freshest live-rollout (the one Operations defaults to).
            try:
                if ensure_realistic_scale_demo(db):
                    logger.info("Demo mode: loaded Realistic Scale showcase (full-potential catalog)")
            except Exception:
                logger.exception("Realistic Scale showcase seeding skipped")
            # Milk hero: seed the primary POS-mismatch scenario (freshest live batch)
            try:
                from app.services.scenarios import ensure_milk_hero
                ensure_milk_hero(db)
            except Exception:
                logger.exception("Milk hero seeding skipped")
            # LIVE = true clean slate: drop any stray user-scoped data so Live mode
            # starts empty (bring-your-own-data). The demo:* showcase is untouched.
            try:
                purged = purge_user_scope(db)
                if any(purged.values()):
                    logger.info("Demo mode: purged stray user-scope data for a clean Live slate: %s", purged)
            except Exception:
                logger.exception("Live-scope purge skipped")
    yield
    # No teardown work for now.


app = FastAPI(
    title="ShelfTrace Control Plane",
    description="Canary rollout, execution reconciliation, and incident recovery for "
    "AI-approved grocery price changes.",
    version="0.1.0",
    lifespan=lifespan,
)

# Per-request ID + access log line. Outer-most so X-Request-ID covers errors too.
app.add_middleware(RequestIDMiddleware)

# CORS — explicit allowlist replaces the prior wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Actor-Name", "X-Request-ID", "Authorization"],
    expose_headers=["X-Request-ID"],
)

# Rate limiter — opt-in. When enabled, attach the slowapi exception handler
# so over-limit requests return a clean 429 instead of an opaque 500.
_limiter = get_limiter()
if _limiter is not None:
    try:
        from slowapi.errors import RateLimitExceeded
        from slowapi import _rate_limit_exceeded_handler

        app.state.limiter = _limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    except ImportError:  # pragma: no cover - handled in rate_limit module
        pass

app.include_router(batches.router)
app.include_router(operations.router)
app.include_router(incidents.router)
app.include_router(receipts.router)
app.include_router(engineering.router)
app.include_router(certification.router)
app.include_router(scenarios.router)
app.include_router(data_replay.router)
app.include_router(regression.router)
app.include_router(scraping.router)
app.include_router(pricing.router)
app.include_router(product_graph.router)
app.include_router(demo.router)
# Synthetic competitor storefront the fresh_market_demo spider scrapes over
# real HTTP. Served outside /api/v1 — it stands in for a competitor website.
app.include_router(storefront.router)


def _check_db() -> tuple[bool, str | None]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:  # pragma: no cover - liveness probe
        return False, str(exc)[:200]


def _check_redis() -> tuple[bool, str | None]:
    try:
        import redis  # noqa: WPS433

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1.0)
        client.ping()
        return True, None
    except Exception as exc:  # pragma: no cover - liveness probe
        return False, str(exc)[:200]


@app.get("/health")
def health(response: Response):
    """Deep liveness probe — DB always required, Redis only when REDIS_ENABLED.

    Free-tier hosts often skip Redis (the API drains the outbox inline). In
    that case the probe reports redis as "disabled" rather than failing, so
    the container stays healthy and the platform doesn't restart it.
    """
    db_ok, db_err = _check_db()

    if settings.redis_enabled:
        redis_ok, redis_err = _check_redis()
        redis_view: dict[str, object] = {"ok": redis_ok, "error": redis_err}
        ok = db_ok and redis_ok
    else:
        redis_view = {"ok": True, "status": "disabled"}
        ok = db_ok

    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "healthy" if ok else "degraded",
        "service": "shelftrace-control-plane",
        "app_env": settings.normalized_app_env,
        "demo_mode": settings.demo_mode,
        "auth_enabled": auth_enabled(),
        "otel_enabled": settings.otel_enabled,
        "rate_limit_enabled": settings.rate_limit_enabled,
        "log_format": settings.log_format,
        "dependencies": {
            "database": {"ok": db_ok, "error": db_err},
            "redis": redis_view,
        },
    }


@app.get("/")
def root():
    return {"message": "ShelfTrace Control Plane API", "docs": "/docs"}
