"""Request middleware: per-request ID + access log line.

Every request gets an ``X-Request-ID`` (preserved if the caller sent one,
generated otherwise). The id is stored in a ContextVar so every log line
emitted while handling that request is auto-tagged with it (see
``app.logging_config.RequestContextFilter``). The id is echoed back in the
response so clients can quote it in support requests.

Also emits one access-log line per request with route/method/status/duration —
the kind of thing every production proxy gives you and that ``logging.info``
alone does not.
"""
from __future__ import annotations

import logging
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

request_id_var: ContextVar[str] = ContextVar("request_id", default="")

_access_log = logging.getLogger("shelftrace.access")


def current_request_id() -> str:
    return request_id_var.get()


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:16]}"
        token = request_id_var.set(rid)
        start = time.monotonic()
        status_code = 500
        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = rid
            return response
        finally:
            duration_ms = int((time.monotonic() - start) * 1000)
            _access_log.info(
                "request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": status_code,
                    "duration_ms": duration_ms,
                    "client": request.client.host if request.client else None,
                },
            )
            request_id_var.reset(token)
