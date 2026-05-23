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

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://shelftrace:shelftrace@localhost:5432/shelftrace_db"
    redis_url: str = "redis://localhost:6379/0"
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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
