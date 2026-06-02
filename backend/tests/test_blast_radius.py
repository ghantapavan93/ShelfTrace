"""Blast radius — an incident quantified as money-at-risk per day.

Proves the derivation multiplies per-unit delta by real sales velocity, weights
KVI items, and — critically — never fabricates a number when there's no history.
"""
from __future__ import annotations

from datetime import timedelta

from app.models import (
    Channel,
    ChannelDelivery,
    DeliveryStatus,
    ExecutionReceipt,
    HistoricalSale,
    Incident,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
    ReceiptStatus,
    RunMode,
    Environment,
    utcnow,
)
from app.services import blast_radius


def _batch(db):
    b = PriceBatch(
        id="b_blast", external_id="blast-test", idempotency_key="idem-blast",
        name="Blast Test", zone="Z", run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION, total_store_count=1,
    )
    db.add(b); db.flush()
    return b


def _action(db, batch, *, sku, approved, prior, is_kvi=False):
    a = PriceAction(
        id=f"a_{sku}", batch_id=batch.id, sku=sku, product_name=sku,
        store_id="s1", approved_price=approved, prior_price=prior,
        reason="t", is_kvi=is_kvi,
    )
    db.add(a); db.flush()
    return a


def _incident(db, batch, action, channel=Channel.POS):
    inc = Incident(
        id=f"inc_{action.sku}", batch_id=batch.id, action_id=action.id,
        type=IncidentType.PRICE_MISMATCH, severity=IncidentSeverity.CRITICAL,
        status=IncidentStatus.OPEN, summary="mismatch", offending_channel=channel,
    )
    db.add(inc); db.flush()
    return inc


def _seed_sales(db, sku, *, units_per_day, days=5):
    base = utcnow()
    for d in range(days):
        db.add(HistoricalSale(
            id=f"sale_{sku}_{d}", sku=sku, store_id="s1",
            date=base - timedelta(days=d), price=5.0, units_sold=units_per_day,
        ))
    db.flush()


def test_blast_radius_multiplies_delta_by_velocity(db):
    b = _batch(db)
    a = _action(db, b, sku="milk", approved=5.99, prior=6.49)
    _seed_sales(db, "milk", units_per_day=100)  # 100 units/day
    inc = _incident(db, b, a)
    db.commit()

    # Register rang $6.49 vs approved $5.99 -> $0.50/unit overcharge.
    br = blast_radius.for_incident(db, inc, observed_price=6.49)
    assert br.per_unit_delta == 0.50
    assert br.daily_units == 100.0
    assert br.daily_dollars_at_risk == 50.0  # 0.50 * 100
    assert br.has_velocity is True


def test_kvi_item_is_flagged_in_blast_radius(db):
    b = _batch(db)
    a = _action(db, b, sku="eggs", approved=3.49, prior=3.99, is_kvi=True)
    _seed_sales(db, "eggs", units_per_day=40)
    inc = _incident(db, b, a)
    db.commit()
    br = blast_radius.for_incident(db, inc, observed_price=3.99)
    assert br.is_kvi is True
    assert "KVI" in br.basis


def test_no_history_does_not_fabricate_a_number(db):
    """A freshly uploaded SKU with no sales history must report unknown velocity,
    not a made-up dollar figure."""
    b = _batch(db)
    a = _action(db, b, sku="brand-new", approved=2.99, prior=3.49)
    inc = _incident(db, b, a)
    db.commit()
    br = blast_radius.for_incident(db, inc, observed_price=3.49)
    assert br.per_unit_delta == 0.50          # delta is still known
    assert br.daily_units is None             # velocity is not
    assert br.daily_dollars_at_risk is None   # and we don't invent it
    assert br.has_velocity is False
    assert "can't be estimated" in br.basis


def test_implausible_incident_uses_prior_price_delta(db):
    """An implausible-price incident has no channel divergence, so the delta is
    measured against the prior price (how far the suspect price moved)."""
    b = _batch(db)
    a = _action(db, b, sku="slip", approved=0.49, prior=4.90)
    _seed_sales(db, "slip", units_per_day=10)
    inc = Incident(
        id="inc_slip", batch_id=b.id, action_id=a.id,
        type=IncidentType.IMPLAUSIBLE_PRICE, severity=IncidentSeverity.CRITICAL,
        status=IncidentStatus.OPEN, summary="implausible", offending_channel=None,
    )
    db.add(inc); db.commit()

    br = blast_radius.for_incident(db, inc, observed_price=None)
    assert br.per_unit_delta == round(abs(0.49 - 4.90), 2)  # 4.41
    assert br.daily_dollars_at_risk == round(4.41 * 10, 2)
