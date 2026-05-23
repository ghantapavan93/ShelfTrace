"""Dead-letter handling: structured ERROR log + optional webhook.

A poison message that exhausts retries is the most important thing a
reliability system can fail to notice. This module is the alert path:

  • Always emits a structured ERROR log with the event id, type, attempts
    and the originating action_id when present. Hooks any log shipper
    (Datadog, Splunk, CloudWatch, etc.) without extra config.

  • If ``DEAD_LETTER_WEBHOOK_URL`` is set, also POSTs a Slack-compatible
    payload there. Best effort; never raises, never blocks the outbox.
"""
from __future__ import annotations

import logging

from app.config import settings
from app.models import OutboxEvent

logger = logging.getLogger("shelftrace.dead_letter")


def _payload(event: OutboxEvent, reason: str) -> dict:
    return {
        "service": "shelftrace-control-plane",
        "event_id": event.id,
        "event_type": event.event_type,
        "aggregate_id": event.aggregate_id,
        "attempts": event.attempts,
        "reason": reason[:500],
    }


def _notify_webhook(payload: dict) -> None:
    url = settings.dead_letter_webhook_url
    if not url:
        return
    try:
        import httpx

        text = (
            f":rotating_light: ShelfTrace dead-letter\n"
            f"`{payload['event_type']}` · attempts={payload['attempts']} · "
            f"event=`{payload['event_id']}` · reason: {payload['reason']}"
        )
        httpx.post(url, json={"text": text, **payload}, timeout=2.0)
    except Exception:  # pragma: no cover - webhook is best-effort
        logger.exception("dead_letter webhook POST failed")


def alert(event: OutboxEvent, reason: str) -> None:
    payload = _payload(event, reason)
    logger.error(
        "outbox.dead_letter",
        extra={
            "event_id": payload["event_id"],
            "event_type": payload["event_type"],
            "aggregate_id": payload["aggregate_id"],
            "attempts": payload["attempts"],
            "reason": payload["reason"],
        },
    )
    _notify_webhook(payload)
