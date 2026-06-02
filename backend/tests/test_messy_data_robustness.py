"""Does the engine survive messy, multi-store, never-before-seen data — or does
it only work on the hand-fed demo?

This file is the honest stress test. It does THREE things:

1. PROVES input defense: a messy CSV (garbage prices, missing fields, dup SKUs,
   blanks) lets the good rows through and flags every bad row with a reason —
   no crash, no silent execution.

2. PROVES the reconciliation engine scales past the demo: a batch with MULTIPLE
   products across MULTIPLE stores, several with wrong POS prices, opens exactly
   the right incidents on the right (sku, store) pairs and blocks the batch.
   Nothing is hardcoded to milk/eggs — the products here are deliberately novel.

3. DOCUMENTS the known gap (does NOT hide it): a *plausible-but-wrong* price
   that is internally consistent across all three channels (a decimal-slip like
   $0.49 milk) passes every validation and reconciles "verified" — because the
   engine today checks channel AGREEMENT, not price PLAUSIBILITY. There is no
   anomaly/outlier detection yet. The test asserts the current behavior and
   marks it as the next-build target, so the gap is proven, not glossed.
"""
from __future__ import annotations

import pytest

from app.models import (
    ActionDecision,
    BatchStatus,
    Incident,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
)
from app.schemas import ConnectorBehaviorIn, ScenarioActionIn, ScenarioIn
from app.services import bulk_import, recovery, scenarios


# ──────────────────────────────────────────────────────────────────────
# 1. Messy CSV — good rows survive, every bad row flagged, no crash
# ──────────────────────────────────────────────────────────────────────
def test_messy_csv_keeps_good_rows_and_flags_every_bad_one():
    """A realistic 'someone exported a dirty spreadsheet' payload: novel grocery
    products mixed with missing fields, garbage prices, a duplicate, and blanks.
    Good rows must import; bad rows must be flagged with reasons; nothing crashes."""
    csv_data = (
        "sku,product_name,prior_price,approved_price\n"
        "avo-hass-4ct,Hass Avocados 4 Count,5.49,4.99\n"      # good
        "canola-48,Canola Oil 48 oz,7.99,6.49\n"               # good
        ",Orphan No SKU,2.99,2.49\n"                            # missing sku
        "bun-8,Hot Dog Buns 8ct,abc,1.99\n"                    # non-numeric prior
        "cola-12,Cola Soda 12pk,6.99,-3.00\n"                  # negative approved
        "avo-hass-4ct,Hass Avocados DUPLICATE,5.49,4.79\n"     # duplicate sku
        "milk-typo,Whole Milk 1gal,4.90,49.00\n"               # 10x typo guard
        "   ,   ,   ,   \n"                                     # blank row
        "eggs-12,Cage-Free Eggs Dozen,3.49,\n"                 # missing approved
    )

    result = bulk_import.preview("csv", csv_data)

    valid = {r.sku for r in result.rows if r.valid}
    invalid = {r.sku: r.errors for r in result.rows if not r.valid}

    # The two clean novel products import.
    assert "avo-hass-4ct" in valid or any(
        r.sku == "avo-hass-4ct" and r.valid for r in result.rows
    )
    assert "canola-48" in valid

    # Every bad row is flagged — and the reasons are specific, not generic.
    assert any("sku is required" in e for r in result.rows
               for e in r.errors if not r.valid)
    assert any("prior_price must be a number" in e for r in result.rows
               for e in r.errors)
    assert any("approved_price must be > 0" in e for r in result.rows
               for e in r.errors)
    assert any("duplicate sku" in e for r in result.rows for e in r.errors)
    assert any("5×" in e or "5x" in e or "typo" in e for r in result.rows
               for e in r.errors)
    assert any("approved_price is required" in e for r in result.rows
               for e in r.errors)

    # Blank row counted, not errored; nothing executed; summary adds up.
    assert result.blank_rows_skipped >= 1
    assert result.summary["valid"] >= 2
    assert result.summary["total"] == result.summary["valid"] + result.summary["invalid"]


# ──────────────────────────────────────────────────────────────────────
# 2. Multi-store × multi-product, several wrong — engine scales, not hardcoded
# ──────────────────────────────────────────────────────────────────────
def _multi_store_scenario():
    """3 NOVEL products × 3 stores = 9 actions. Three (store, sku) pairs carry a
    stale POS price; the rest are clean. Deliberately non-demo products so a pass
    can't be a hardcoded fluke."""
    stores = ["store-A", "store-B", "store-C"]
    products = [
        ("avo-hass-4ct", "Hass Avocados 4 Count", 5.49, 4.99),
        ("canola-48", "Canola Oil 48 oz", 7.99, 6.49),
        ("bun-8", "Hot Dog Buns 8 Count", 2.49, 1.99),
    ]
    actions = [
        ScenarioActionIn(product_name=n, sku=s, previous_price=p, approved_price=a)
        for (s, n, p, a) in products
    ]
    # Three independent failures across different stores AND different products:
    #   - avocados stale at store-A
    #   - canola  stale at store-B
    #   - buns    stale at store-C
    behaviors = [
        ConnectorBehaviorIn(store_id="store-A", sku="avo-hass-4ct", channel_type="pos",
                            behavior_type="stale_price", configured_observed_price=6.19,
                            retry_success_price=4.99),
        ConnectorBehaviorIn(store_id="store-B", sku="canola-48", channel_type="pos",
                            behavior_type="stale_price", configured_observed_price=7.99,
                            retry_success_price=6.49),
        ConnectorBehaviorIn(store_id="store-C", sku="bun-8", channel_type="pos",
                            behavior_type="stale_price", configured_observed_price=2.49,
                            retry_success_price=1.99),
    ]
    return ScenarioIn(
        name="Messy Multi-Store Batch",
        run_mode="live_rollout",
        zone_name="Region 7",
        store_ids=stores,
        canary_store_ids=stores,  # all canary so every mismatch reconciles now
        actions=actions,
        behaviors=behaviors,
    )


def test_multi_store_multi_product_opens_exactly_the_right_incidents(db):
    """Nine actions, three wrong. The engine must open exactly three critical
    mismatch incidents — each on the correct (sku, store) — and block the batch.
    This is the 'many stores, many items, several wrong' case proven on novel
    products, so it can't be a milk/eggs hardcode."""
    cfg = scenarios.create_config(db, _multi_store_scenario())
    batch = scenarios.execute_live(db, cfg)

    incidents = (
        db.query(Incident)
        .filter(Incident.batch_id == batch.id, Incident.type == IncidentType.PRICE_MISMATCH)
        .all()
    )
    # Exactly the three seeded failures — no more (no phantom incidents on the
    # six clean actions), no fewer (none silently swallowed).
    assert len(incidents) == 3

    flagged = set()
    for inc in incidents:
        a = db.get(PriceAction, inc.action_id)
        flagged.add((a.sku, a.store_id))
    assert flagged == {
        ("avo-hass-4ct", "store-A"),
        ("canola-48", "store-B"),
        ("bun-8", "store-C"),
    }

    # The batch is held — one bad canary action is enough.
    assert batch.status == BatchStatus.BLOCKED

    # The six clean actions are eligible; the three bad ones are blocked.
    actions = db.query(PriceAction).filter(PriceAction.batch_id == batch.id).all()
    eligible = [a for a in actions if a.decision == ActionDecision.ELIGIBLE]
    blocked = [a for a in actions if a.decision == ActionDecision.BLOCKED]
    assert len(actions) == 9
    assert len(blocked) == 3
    assert len(eligible) == 6


def test_one_store_feed_entirely_broken_still_isolates_per_action(db):
    """If ONE store's POS feed is wrong for EVERY product (a realistic 'store-B's
    integration broke' incident), the engine opens an incident per affected
    action and still verifies the other stores. It does not crash or let the
    bad store poison the clean ones — each action is reconciled independently."""
    stores = ["store-A", "store-B"]
    products = [
        ("avo-hass-4ct", "Hass Avocados", 5.49, 4.99),
        ("canola-48", "Canola Oil", 7.99, 6.49),
    ]
    actions = [
        ScenarioActionIn(product_name=n, sku=s, previous_price=p, approved_price=a)
        for (s, n, p, a) in products
    ]
    # store-B's POS is stale for BOTH products; store-A is clean.
    behaviors = [
        ConnectorBehaviorIn(store_id="store-B", sku="avo-hass-4ct", channel_type="pos",
                            behavior_type="stale_price", configured_observed_price=9.99,
                            retry_success_price=4.99),
        ConnectorBehaviorIn(store_id="store-B", sku="canola-48", channel_type="pos",
                            behavior_type="stale_price", configured_observed_price=9.99,
                            retry_success_price=6.49),
    ]
    payload = ScenarioIn(
        name="Broken Store Feed", run_mode="live_rollout", zone_name="Region 7",
        store_ids=stores, canary_store_ids=stores, actions=actions, behaviors=behaviors,
    )
    cfg = scenarios.create_config(db, payload)
    batch = scenarios.execute_live(db, cfg)

    incidents = db.query(Incident).filter(
        Incident.batch_id == batch.id, Incident.type == IncidentType.PRICE_MISMATCH
    ).all()
    # Both store-B actions flagged; both store-A actions clean.
    bad_stores = {db.get(PriceAction, i.action_id).store_id for i in incidents}
    assert len(incidents) == 2
    assert bad_stores == {"store-B"}
    assert batch.status == BatchStatus.BLOCKED


# ──────────────────────────────────────────────────────────────────────
# 3. THE GAP IS NOW CLOSED — the plausibility GATE catches a decimal slip
#    BEFORE it executes (was a documented limitation; now enforced).
# ──────────────────────────────────────────────────────────────────────
def test_decimal_slip_is_now_gated_before_execution(db):
    """Previously the KNOWN_GAP: a decimal-slip price ($4.90 typed $0.49) is a
    *plausible* number — > 0, numeric, non-duplicate — that passes every input
    validation, and if all channels then agree on it the reconciliation engine
    (which checks AGREEMENT, not PLAUSIBILITY) would let it sail through.

    The plausibility GATE now closes that hole: on execute, a CRITICAL finding
    opens an IMPLAUSIBLE_PRICE incident and HOLDS the batch, so the wrong price
    is stopped before rollout — not merely reported. This test is the inverted
    proof: the gap that was documented open is now demonstrably shut."""
    payload = ScenarioIn(
        name="Decimal Slip", run_mode="live_rollout", zone_name="Region 7",
        store_ids=["store-A"], canary_store_ids=["store-A"],
        actions=[
            # $4.90 typed as $0.49 — a 90% drop. Internally consistent and within
            # the import numeric guards, but a textbook decimal slip.
            ScenarioActionIn(product_name="Organic Whole Milk 1gal", sku="milk-slip",
                             previous_price=4.90, approved_price=0.49),
        ],
        behaviors=[],  # all channels succeed → they AGREE on the wrong price
    )
    cfg = scenarios.create_config(db, payload)
    batch = scenarios.execute_live(db, cfg)

    # The gate opened an IMPLAUSIBLE_PRICE incident pre-execution.
    implausible = db.query(Incident).filter(
        Incident.batch_id == batch.id, Incident.type == IncidentType.IMPLAUSIBLE_PRICE
    ).all()
    assert len(implausible) == 1
    assert implausible[0].severity.value == "critical"

    # And the batch is HELD — the suspect price cannot roll out.
    assert batch.status == BatchStatus.BLOCKED
    action = db.query(PriceAction).filter(PriceAction.batch_id == batch.id).one()
    assert action.decision == ActionDecision.BLOCKED


def test_implausible_price_incident_cannot_be_retried_or_resolved_away(db):
    """The gate must not be defeatable in one click. An IMPLAUSIBLE_PRICE incident
    is a DATA error: every channel already agrees on the wrong approved price, so
    retry (re-publish) or resolve (re-check channels) would falsely clear it and
    let the bad price roll out. Both must be refused; rollback stays the valid
    exit. (Regression guard for the gate-defeat bug found in review.)"""
    payload = ScenarioIn(
        name="Slip Recovery Guard", run_mode="live_rollout", zone_name="Region 7",
        store_ids=["store-A"], canary_store_ids=["store-A"],
        actions=[
            ScenarioActionIn(product_name="Whole Milk 1gal", sku="milk-slip-guard",
                             previous_price=4.90, approved_price=0.49),
        ],
        behaviors=[],
    )
    cfg = scenarios.create_config(db, payload)
    batch = scenarios.execute_live(db, cfg)
    inc = db.query(Incident).filter(
        Incident.batch_id == batch.id, Incident.type == IncidentType.IMPLAUSIBLE_PRICE
    ).one()

    # Retry is refused — re-publishing the same wrong price can't fix a data error.
    with pytest.raises(recovery.RecoveryError):
        recovery.retry_incident(db, inc.id, actor="reviewer")
    db.refresh(inc)
    assert inc.status == IncidentStatus.OPEN  # untouched, still held

    # Resolve is refused too — channels agreeing on the wrong number isn't a fix.
    with pytest.raises(recovery.RecoveryError):
        recovery.resolve_incident(db, inc.id, actor="reviewer")
    db.refresh(inc)
    assert inc.status == IncidentStatus.OPEN

    # Rollback IS allowed — it's the legitimate exit (restore the prior price).
    recovery.rollback_incident(db, inc.id, actor="reviewer")
    db.refresh(inc)
    assert inc.status == IncidentStatus.ROLLED_BACK


# ──────────────────────────────────────────────────────────────────────
# 4. EFFECTIVE-DATING — a not-yet-live price isn't a mismatch
# ──────────────────────────────────────────────────────────────────────
def test_future_dated_price_is_pending_not_a_mismatch(db):
    """Grocery prices are time-bound: the weekly ad starts Wednesday. A price
    scheduled for the future hasn't taken effect, so the channels correctly still
    show the OLD price. Reconciliation must treat it as PENDING activation and
    open NO incident — flagging a not-yet-live price would be a false alarm.

    Built future-dated from the start (the realistic path), so the very first
    reconcile sees it as pending and never opens a mismatch."""
    from datetime import timedelta
    from app.models import (
        Channel, ChannelDelivery, DeliveryStatus, Environment, RunMode, utcnow,
    )
    from app.services import reconciliation

    # Construct a batch + a single future-dated action directly, with its three
    # channel deliveries, so reconcile_action runs against a genuinely not-yet-live
    # price on its FIRST pass (mirrors how ingestion would set effective_at).
    batch = PriceBatch(
        id="b_future", external_id="future-ad", idempotency_key="idem-future",
        name="Future Ad", zone="Region 7", run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION, total_store_count=1,
    )
    db.add(batch); db.flush()
    action = PriceAction(
        id="a_future", batch_id=batch.id, sku="cola-future", product_name="Cola 12pk",
        store_id="s1", approved_price=4.99, prior_price=6.99, reason="weekly ad",
        effective_at=utcnow() + timedelta(days=2),  # not live yet
    )
    db.add(action); db.flush()
    for ch in (Channel.POS, Channel.ESL, Channel.ECOMMERCE):
        db.add(ChannelDelivery(id=f"d_{ch.value}", action_id=action.id, channel=ch,
                               status=DeliveryStatus.PENDING))
    db.commit()

    decision = reconciliation.reconcile_action(db, action)

    # Not-yet-live → PENDING activation, and NO incident opened at all.
    assert decision == ActionDecision.PENDING
    assert db.query(Incident).filter(Incident.action_id == action.id).count() == 0


def test_past_dated_price_reconciles_normally(db):
    """Once effective_at is in the past (the ad has started), the price is live
    and a genuine POS mismatch IS flagged — effective-dating doesn't suppress
    real incidents, only premature ones."""
    from datetime import timedelta
    from app.models import utcnow
    from app.services import reconciliation

    payload = ScenarioIn(
        name="Live Ad Price", run_mode="live_rollout", zone_name="Region 7",
        store_ids=["s1"], canary_store_ids=["s1"],
        actions=[
            ScenarioActionIn(product_name="Cola 12pk", sku="cola-live",
                             previous_price=6.99, approved_price=4.99),
        ],
        behaviors=[
            ConnectorBehaviorIn(store_id="s1", sku="cola-live", channel_type="pos",
                                behavior_type="stale_price", configured_observed_price=6.99),
        ],
    )
    cfg = scenarios.create_config(db, payload)
    batch = scenarios.execute_live(db, cfg)
    action = db.query(PriceAction).filter(
        PriceAction.batch_id == batch.id, PriceAction.store_id == "s1"
    ).one()
    action.effective_at = utcnow() - timedelta(hours=1)  # already live
    db.commit()
    decision = reconciliation.reconcile_action(db, action)

    assert decision == ActionDecision.BLOCKED  # real mismatch still caught
