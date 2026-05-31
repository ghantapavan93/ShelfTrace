"""Operator acknowledgement is a real, enforced ownership record.

The reliability guarantee under test: no incident leaves the OPEN state via a
recovery action without an acknowledgement on record (who + when). Acknowledgement
is modeled as a timestamp+actor (orthogonal to the recovery lifecycle), so an
incident can be acknowledged AND retrying at once — and the audit trail always
reads ack -> recovery, never an un-owned close.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import (
    AuditEvent,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
)
from app.schemas import ConnectorBehaviorIn, ScenarioActionIn, ScenarioIn
from app.services import recovery, scenarios


def _stale_pos_scenario():
    """A scenario whose POS reports a stale price on the canary store, so executing
    it opens exactly one critical PRICE_MISMATCH incident to act on."""
    return ScenarioIn(
        name="Ack Test — Stale POS",
        run_mode="live_rollout",
        zone_name="Test Zone",
        store_ids=["s1", "s2"],
        canary_store_ids=["s1"],
        actions=[
            ScenarioActionIn(
                product_name="Test Product", sku="ack-sku-1",
                previous_price=3.49, approved_price=2.99, reason="promo",
            )
        ],
        behaviors=[
            ConnectorBehaviorIn(
                store_id="s1", sku="ack-sku-1", channel_type="pos",
                behavior_type="stale_price", configured_observed_price=3.49,
                retry_success_price=2.99,
            )
        ],
    )


def _open_incident(db) -> Incident:
    cfg = scenarios.create_config(db, _stale_pos_scenario())
    batch = scenarios.execute_live(db, cfg)
    inc = db.scalar(
        select(Incident).where(
            Incident.batch_id == batch.id, Incident.type == IncidentType.PRICE_MISMATCH
        )
    )
    assert inc is not None and inc.status == IncidentStatus.OPEN
    assert inc.acknowledged_at is None  # nothing acknowledged yet
    return inc


def test_acknowledge_records_owner_and_timestamp(db):
    inc = _open_incident(db)

    acked = recovery.acknowledge_incident(db, inc.id, actor="alice")

    assert acked.acknowledged_at is not None
    assert acked.acknowledged_by == "alice"
    # Audit trail captured the ownership event.
    events = list(db.scalars(select(AuditEvent).where(AuditEvent.incident_id == inc.id)))
    assert any(e.event == "Incident acknowledged" and e.actor == "alice" for e in events)


def test_acknowledge_is_idempotent_and_preserves_first_owner(db):
    inc = _open_incident(db)
    first = recovery.acknowledge_incident(db, inc.id, actor="alice")
    first_time = first.acknowledged_at

    again = recovery.acknowledge_incident(db, inc.id, actor="bob")

    # Second ack is a no-op: original owner + timestamp preserved.
    assert again.acknowledged_by == "alice"
    assert again.acknowledged_at == first_time
    # Exactly one acknowledgement audit event exists.
    acks = [
        e for e in db.scalars(select(AuditEvent).where(AuditEvent.incident_id == inc.id))
        if e.event == "Incident acknowledged"
    ]
    assert len(acks) == 1


def test_retry_auto_acknowledges_when_operator_skipped_the_button(db):
    """Going straight to Retry still stamps an acknowledgement first — recovery
    is never un-owned. The audit must read ack BEFORE the retry request."""
    inc = _open_incident(db)
    assert inc.acknowledged_at is None

    recovery.retry_incident(db, inc.id, actor="carol")

    db.refresh(inc)
    assert inc.acknowledged_at is not None
    assert inc.acknowledged_by == "carol"
    events = list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.incident_id == inc.id)
            .order_by(AuditEvent.created_at)
        )
    )
    names = [e.event for e in events]
    assert "Incident acknowledged" in names
    assert "POS retry requested" in names
    # Acknowledgement is recorded no later than the retry request.
    assert names.index("Incident acknowledged") <= names.index("POS retry requested")


def test_resolved_incident_always_carries_an_acknowledgement(db):
    """The headline guarantee: a resolved incident has an owner on record, even
    if the operator never clicked Acknowledge explicitly."""
    inc = _open_incident(db)
    # Retry heals POS to the approved price (retry_success_price), which resolves.
    recovery.retry_incident(db, inc.id, actor="dave")

    db.refresh(inc)
    assert inc.status == IncidentStatus.RESOLVED
    assert inc.acknowledged_at is not None
    assert inc.acknowledged_by == "dave"


def test_cannot_acknowledge_a_terminal_incident(db):
    inc = _open_incident(db)
    recovery.retry_incident(db, inc.id, actor="erin")  # heals -> RESOLVED
    db.refresh(inc)
    assert inc.status == IncidentStatus.RESOLVED

    with pytest.raises(recovery.RecoveryError):
        recovery.acknowledge_incident(db, inc.id, actor="erin")


def test_acknowledge_then_retry_keeps_explicit_owner(db):
    """Explicit Acknowledge before Retry: the explicit owner wins; retry does not
    overwrite it."""
    inc = _open_incident(db)
    recovery.acknowledge_incident(db, inc.id, actor="frank")
    recovery.retry_incident(db, inc.id, actor="grace")

    db.refresh(inc)
    assert inc.acknowledged_by == "frank"  # not overwritten by the retrying actor
