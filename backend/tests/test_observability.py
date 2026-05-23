"""Structured logging + request-ID propagation."""
from __future__ import annotations

import logging
from io import StringIO

from fastapi.testclient import TestClient

from app.logging_config import JsonFormatter, RequestContextFilter, configure_logging
from app.main import app
from app.middleware import request_id_var


def test_request_id_round_trips(db):
    """Every response carries an X-Request-ID; an inbound one is preserved."""
    client = TestClient(app)
    r = client.get("/health")
    assert r.headers.get("X-Request-ID"), "X-Request-ID should be set on every response"

    r2 = client.get("/health", headers={"X-Request-ID": "req_my-inbound-id"})
    assert r2.headers["X-Request-ID"] == "req_my-inbound-id"


def test_json_formatter_emits_request_context():
    """JSON formatter attaches request_id from the contextvar to every line."""
    token = request_id_var.set("req_test_1234")
    try:
        rec = logging.LogRecord(
            name="shelftrace.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="hello %s",
            args=("world",),
            exc_info=None,
        )
        RequestContextFilter().filter(rec)
        out = JsonFormatter().format(rec)
        # Must be valid JSON with the request_id field populated.
        import json as _json

        payload = _json.loads(out)
        assert payload["request_id"] == "req_test_1234"
        assert payload["message"] == "hello world"
        assert payload["level"] == "INFO"
    finally:
        request_id_var.reset(token)


def test_configure_logging_idempotent():
    """configure_logging() can be called repeatedly without stacking handlers."""
    configure_logging("info", "json")
    root = logging.getLogger()
    n1 = len(root.handlers)
    configure_logging("info", "json")
    assert len(root.handlers) == n1, "should not stack handlers"
