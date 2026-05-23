"""OpenTelemetry tracing — opt-in via OTEL_ENABLED=true.

Lazy imports keep the OTel SDK out of the import graph when disabled (so a
deployment that doesn't want it can skip the optional dependency group).

When enabled: instruments FastAPI, SQLAlchemy and Redis with auto-spans,
exports OTLP/HTTP to ``otel_endpoint``. trace_id / span_id flow into the
structured log lines via ``app.logging_config.RequestContextFilter``.

Install the optional extras:
    pip install -e ".[otel]"
"""
from __future__ import annotations

import logging

from fastapi import FastAPI

from app.config import settings
from app.database import engine

logger = logging.getLogger("shelftrace.observability")


def setup_tracing(app: FastAPI) -> None:
    if not settings.otel_enabled:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.sdk.resources import SERVICE_NAME, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError as exc:
        logger.warning(
            "OTEL_ENABLED=true but opentelemetry packages are not installed "
            "(install `pip install -e .[otel]`). Continuing without tracing. %s",
            exc,
        )
        return

    resource = Resource.create({SERVICE_NAME: settings.otel_service_name})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=f"{settings.otel_endpoint.rstrip('/')}/v1/traces")
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app, excluded_urls="health,docs,openapi.json")
    SQLAlchemyInstrumentor().instrument(engine=engine)
    try:
        RedisInstrumentor().instrument()
    except Exception:  # pragma: no cover - redis client may not be loaded
        pass

    logger.info(
        "OpenTelemetry tracing enabled · service=%s · endpoint=%s",
        settings.otel_service_name,
        settings.otel_endpoint,
    )
