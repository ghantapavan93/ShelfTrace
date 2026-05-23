"""Application settings.

Read from environment (or a .env file). Three new production-readiness knobs:

  • cors_origins      — comma-separated allowlist replacing the prior wildcard.
                        Default: http://localhost:3000 (the Next.js dev server).
  • api_keys_json     — JSON map of API key → {role, actor}. When empty (the
                        default), the API runs unauthenticated — preserves the
                        demo + the 34 existing tests. When set, every mutating
                        endpoint requires X-API-Key with role=operator and
                        records the resolved actor in the audit trail.
  • use_alembic       — when true, run `alembic upgrade head` on startup
                        instead of SQLAlchemy `create_all()`. Default false
                        (keeps the demo and tests on the existing schema-sync
                        path); enable for real deployments.
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
    api_keys_json: str = ""  # e.g. '{"op-key-1":{"role":"operator","actor":"Avery Davis"}}'

    # Migrations
    use_alembic: bool = False

    # Rollout policy
    canary_store_count: int = 2
    esl_timeout_seconds: int = 30

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
