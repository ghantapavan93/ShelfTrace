"""Rate limiting — opt-in via RATE_LIMIT_ENABLED.

When enabled, slowapi caps per-IP request rate on mutating endpoints. When
disabled (default), every decorated function is a no-op pass-through so the
demo and the 34+ existing tests aren't perturbed.

The limiter prefers a Redis backend (RATE_LIMIT_REDIS_URL, falls back to
REDIS_URL) so multiple uvicorn workers share the same counters. With no Redis
configured, slowapi uses an in-memory store (per-process only).
"""
from __future__ import annotations

import logging
from typing import Callable

from app.config import settings

logger = logging.getLogger("shelftrace.rate_limit")

_LIMITER = None
_NO_OP = lambda *_a, **_kw: lambda fn: fn  # noqa: E731


def get_limiter():
    """Return the slowapi Limiter instance, constructing it on first use."""
    global _LIMITER
    if _LIMITER is not None:
        return _LIMITER
    if not settings.rate_limit_enabled:
        return None
    try:
        from slowapi import Limiter
        from slowapi.util import get_remote_address
    except ImportError:
        logger.warning(
            "RATE_LIMIT_ENABLED=true but slowapi is not installed; rate limiting disabled"
        )
        return None
    storage_uri = settings.redis_url or "memory://"
    _LIMITER = Limiter(
        key_func=get_remote_address,
        storage_uri=storage_uri,
        default_limits=[settings.rate_limit_default],
    )
    logger.info("Rate limiter enabled · backend=%s · default=%s", storage_uri, settings.rate_limit_default)
    return _LIMITER


def limit_write(limit_str: str | None = None) -> Callable:
    """Decorator: apply the configured write-rate limit to an endpoint.

    Usage in a router:

        @router.post(...)
        @limit_write()
        def create_batch(payload, ...):
            ...

    When the limiter isn't configured, this is a transparent no-op so the
    demo + tests aren't perturbed.
    """
    limiter = get_limiter()
    if limiter is None:
        return _NO_OP()
    return limiter.limit(limit_str or settings.rate_limit_write)
