"""Application settings.

Read from environment (or a .env file). Knobs grouped by concern.

Security:
  • cors_origins              — comma-separated allowlist replacing wildcard.
  • api_keys_json             — JSON map of key → {role, actor}; empty disables.

Migrations:
  • use_alembic               — true → `alembic upgrade head`; false → create_all
                                + db_migrate fallback (default; demo+tests).

Observability:
  • log_format                — "json" (structured) or "text" (human-readable).
  • otel_enabled              — opt-in OpenTelemetry. When true the OTLP exporter
                                ships traces to otel_endpoint.
  • otel_endpoint             — OTLP HTTP endpoint (default: localhost collector).
  • otel_service_name         — service identifier in traces.

Reliability:
  • dead_letter_webhook_url   — optional Slack-compatible webhook posted when
                                an outbox event lands in DEAD_LETTER.
  • outbox_retry_base_seconds — base for exponential backoff (default 1s).
  • outbox_retry_max_seconds  — cap for backoff (default 60s).
  • outbox_max_attempts       — attempts before dead-letter (default 5).

Rate limiting:
  • rate_limit_enabled        — opt-in. Limits applied to mutating endpoints.
  • rate_limit_default        — default policy, e.g. "60/minute".
  • rate_limit_redis_url      — distributed limiter backend (defaults to redis_url).
"""
from __future__ import annotations

import json
import os
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "demo"  # demo | development | staging | production
    database_url: str = "postgresql+psycopg2://shelftrace:shelftrace@localhost:5432/shelftrace_db"
    redis_url: str = "redis://localhost:6379/0"
    # Skip the Redis liveness probe and any optional Redis features when false.
    # Useful for free-tier hosts that don't include a managed Redis. The API
    # drains the outbox inline on POST, so Redis is not required at runtime.
    redis_enabled: bool = True
    demo_mode: bool = True
    log_level: str = "info"

    # Security
    cors_origins: str = "http://localhost:3000"
    api_keys_json: str = ""

    # Migrations
    use_alembic: bool = False

    # Observability
    log_format: str = "text"  # "json" in prod, "text" locally for readability
    otel_enabled: bool = False
    otel_endpoint: str = "http://localhost:4318"
    otel_service_name: str = "shelftrace-control-plane"

    # Reliability
    dead_letter_webhook_url: str = ""
    outbox_retry_base_seconds: float = 1.0
    outbox_retry_max_seconds: float = 60.0
    outbox_max_attempts: int = 5

    # Rate limiting
    rate_limit_enabled: bool = False
    rate_limit_default: str = "60/minute"
    rate_limit_write: str = "20/minute"

    # Rollout policy
    canary_store_count: int = 2
    esl_timeout_seconds: int = 30
    # Pre-execution plausibility gate. When true, a CRITICAL plausibility finding
    # (below-cost, decimal-slip, cross-store outlier) opens an IMPLAUSIBLE_PRICE
    # incident and HOLDS the batch — a bad number is stopped before it executes,
    # not just reported. Warnings remain advisory either way. On by default; set
    # false to fall back to advisory-only (the /plausibility report still works).
    plausibility_gate_enabled: bool = True

    # Scraping demo — the fresh_market_demo spider scrapes the storefront the
    # API serves at /demo-storefront. Empty → resolve the app's own origin
    # (localhost:$PORT), which is correct on localhost, Docker, and the
    # deployed host. Set only if the storefront is hosted elsewhere.
    scrape_storefront_base_url: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def self_base_url(self) -> str:
        """Origin the app serves on — used by the demo storefront spider to
        scrape ShelfTrace's own synthetic storefront over real HTTP."""
        explicit = self.scrape_storefront_base_url.strip()
        if explicit:
            return explicit.rstrip("/")
        return f"http://localhost:{os.environ.get('PORT', '8000')}"

    @property
    def normalized_app_env(self) -> str:
        env = self.app_env.strip().lower()
        return "production" if env == "prod" else env

    @property
    def is_production(self) -> bool:
        return self.normalized_app_env == "production"


def production_startup_errors(config: Settings) -> list[str]:
    """Return blocking config errors for production boots."""
    if not config.is_production:
        return []

    errors: list[str] = []
    parsed_db = urlparse(config.database_url.strip())

    if config.demo_mode:
        errors.append("DEMO_MODE must be false when APP_ENV=production")
    if not parsed_db.scheme.startswith("postgresql"):
        errors.append("DATABASE_URL must use PostgreSQL in production")
    if not config.use_alembic:
        errors.append("USE_ALEMBIC must be true in production")
    if config.log_format.lower() != "json":
        errors.append("LOG_FORMAT must be json in production")
    if not config.rate_limit_enabled:
        errors.append("RATE_LIMIT_ENABLED must be true in production")

    raw_keys = (config.api_keys_json or "").strip()
    if not raw_keys:
        errors.append("API_KEYS_JSON must configure at least one API key in production")
    else:
        try:
            parsed_keys = json.loads(raw_keys)
        except json.JSONDecodeError:
            errors.append("API_KEYS_JSON must be valid JSON in production")
        else:
            if not isinstance(parsed_keys, dict) or not parsed_keys:
                errors.append("API_KEYS_JSON must be a non-empty object in production")
            elif not any(v.get("role") == "operator" for v in parsed_keys.values() if isinstance(v, dict)):
                errors.append("API_KEYS_JSON must include at least one operator key in production")

    origins = config.cors_origin_list
    if not origins:
        errors.append("CORS_ORIGINS must include at least one production origin")
    if "*" in origins:
        errors.append("CORS_ORIGINS cannot contain '*' in production")
    local_markers = ("localhost", "127.0.0.1", "::1")
    if any(any(marker in origin for marker in local_markers) for origin in origins):
        errors.append("CORS_ORIGINS cannot use localhost origins in production")

    return errors


settings = Settings()
