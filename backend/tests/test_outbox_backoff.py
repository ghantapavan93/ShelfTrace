"""Exponential backoff + dead-letter for the outbox worker."""
from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest

from app.config import settings
from app.models import OutboxEvent, OutboxStatus, utcnow
from app.services import orchestrator
from app.services.dead_letter import alert


def _seed_failing_event(db) -> OutboxEvent:
    """An event whose handler always raises, so we can drive it through the
    retry → backoff → dead-letter lifecycle. The test patches _handle_event
    to force the failure; the payload itself just needs to be schema-valid."""
    event = OutboxEvent(
        id="evt_test_fail",
        event_type="RECONCILE_REQUESTED",
        aggregate_id="act_nonexistent",
        payload_json={"action_id": "act_nonexistent", "batch_id": "b_x"},
        status=OutboxStatus.PENDING,
    )
    db.add(event)
    db.commit()
    return event


def test_backoff_delay_grows_exponentially():
    """Delay sequence: 1s → 2s → 4s → 8s → 16s (plus up to 30% jitter), capped."""
    with patch.object(settings, "outbox_retry_base_seconds", 1.0), \
         patch.object(settings, "outbox_retry_max_seconds", 60.0):
        d1 = orchestrator._next_attempt_delay(1)
        d2 = orchestrator._next_attempt_delay(2)
        d3 = orchestrator._next_attempt_delay(3)
        d_cap = orchestrator._next_attempt_delay(20)

    # Each step roughly doubles (jitter is ≤ 30% added).
    assert 1.0 <= d1 <= 1.3
    assert 2.0 <= d2 <= 2.6
    assert 4.0 <= d3 <= 5.2
    # Capped at outbox_retry_max_seconds * 1.3 (cap + jitter).
    assert d_cap <= 60.0 * 1.3


def test_failed_event_schedules_retry_then_dead_letters(db):
    """On failure, the event is RETRYING with next_attempt_at in the future.
    After max attempts, it transitions to DEAD_LETTER and the alert is fired."""

    def _always_raise(_db, _event):
        raise RuntimeError("simulated downstream failure")

    event = _seed_failing_event(db)

    with patch.object(orchestrator, "_handle_event", side_effect=_always_raise), \
         patch.object(settings, "outbox_max_attempts", 3), \
         patch.object(settings, "outbox_retry_base_seconds", 0.001), \
         patch.object(settings, "outbox_retry_max_seconds", 0.01), \
         patch("app.services.orchestrator.dead_letter_alert") as mock_alert:

        # First attempt → RETRYING with future next_attempt_at.
        orchestrator.process_outbox_once(db)
        db.refresh(event)
        assert event.status == OutboxStatus.RETRYING
        assert event.attempts == 1
        assert event.next_attempt_at is not None
        assert event.next_attempt_at > utcnow()
        assert "simulated downstream failure" in (event.last_error or "")
        assert mock_alert.call_count == 0  # not yet

        # Filter respects backoff: with next_attempt_at in the future,
        # process_outbox_once must NOT pick the event back up.
        processed = orchestrator.process_outbox_once(db)
        assert processed == 0
        db.refresh(event)
        assert event.attempts == 1  # unchanged

        # Move next_attempt_at into the past and re-drain twice to reach max.
        event.next_attempt_at = utcnow() - timedelta(seconds=1)
        db.commit()
        orchestrator.process_outbox_once(db)  # attempt 2 → RETRYING
        db.refresh(event)
        event.next_attempt_at = utcnow() - timedelta(seconds=1)
        db.commit()
        orchestrator.process_outbox_once(db)  # attempt 3 → DEAD_LETTER

        db.refresh(event)
        assert event.status == OutboxStatus.DEAD_LETTER
        assert event.attempts == 3
        assert event.next_attempt_at is None
        # Dead-letter alert fired exactly once.
        assert mock_alert.call_count == 1
        called_event, reason = mock_alert.call_args.args
        assert called_event.id == event.id
        assert "simulated downstream failure" in reason


def test_dead_letter_alert_logs_structured_error(caplog):
    """alert() always emits a structured ERROR log even when no webhook is set."""
    event = OutboxEvent(
        id="evt_dl_log",
        event_type="RECONCILE_REQUESTED",
        aggregate_id="act_x",
        payload_json={},
        attempts=5,
        status=OutboxStatus.DEAD_LETTER,
    )
    with caplog.at_level(logging.ERROR, logger="shelftrace.dead_letter"):
        alert(event, "boom")
    assert any("outbox.dead_letter" in rec.message for rec in caplog.records)


import logging  # noqa: E402  (imported late for caplog fixture above)
