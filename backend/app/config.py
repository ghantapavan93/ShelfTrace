from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://shelftrace:shelftrace@localhost:5432/shelftrace_db"
    redis_url: str = "redis://localhost:6379/0"
    demo_mode: bool = True
    log_level: str = "info"

    # Rollout policy
    canary_store_count: int = 2
    esl_timeout_seconds: int = 30


settings = Settings()
