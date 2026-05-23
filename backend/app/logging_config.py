"""Logging configuration.

Two modes:
  • text  — human-readable, default for local dev / tests.
  • json  — structured one-line-JSON per log record, every record carries
            ``request_id`` (from the per-request ContextVar) and, when OTel is
            active, ``trace_id`` + ``span_id`` so logs join up with traces.

Anything that already calls ``logging.getLogger(...)`` benefits automatically.
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

from app.middleware import request_id_var


class RequestContextFilter(logging.Filter):
    """Attach request/trace context to every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        # OpenTelemetry context (set by instrumentation when active).
        try:
            from opentelemetry import trace  # type: ignore

            span = trace.get_current_span()
            ctx = span.get_span_context() if span else None
            if ctx and getattr(ctx, "is_valid", False):
                record.trace_id = format(ctx.trace_id, "032x")
                record.span_id = format(ctx.span_id, "016x")
            else:
                record.trace_id = "-"
                record.span_id = "-"
        except Exception:
            record.trace_id = "-"
            record.span_id = "-"
        return True


class JsonFormatter(logging.Formatter):
    """One-line JSON per record."""

    _RESERVED = {
        "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
        "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
        "created", "msecs", "relativeCreated", "thread", "threadName",
        "processName", "process", "message", "asctime",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "trace_id": getattr(record, "trace_id", "-"),
            "span_id": getattr(record, "span_id", "-"),
        }
        # Forward any structured `extra=` fields that aren't internal.
        for key, value in record.__dict__.items():
            if key in self._RESERVED or key in payload or key.startswith("_"):
                continue
            try:
                json.dumps(value)
                payload[key] = value
            except (TypeError, ValueError):
                payload[key] = repr(value)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class TextFormatter(logging.Formatter):
    """Compact human-readable line with request_id when present."""

    def format(self, record: logging.LogRecord) -> str:
        rid = getattr(record, "request_id", "-")
        prefix = f"[{record.levelname}] {record.name}"
        if rid and rid != "-":
            prefix += f" rid={rid}"
        return f"{prefix} {record.getMessage()}"


def configure_logging(level: str = "info", fmt: str = "text") -> None:
    """Install the root handler. Idempotent."""
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestContextFilter())
    handler.setFormatter(JsonFormatter() if fmt == "json" else TextFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())
    # Quiet uvicorn's own duplicate access log — ours is richer.
    logging.getLogger("uvicorn.access").handlers.clear()
    logging.getLogger("uvicorn.access").propagate = True
