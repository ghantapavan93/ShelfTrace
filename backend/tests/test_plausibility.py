"""Plausibility guard — flag approved prices that look like DATA ERRORS.

This is the layer that closes the KNOWN_GAP from test_messy_data_robustness:
the engine reconciles channel AGREEMENT, but a *plausible-but-wrong* number
(a decimal slip, a below-cost price, one store wildly off its siblings) needs a
separate plausibility check. These tests prove all three deterministic signals
fire correctly AND — just as important — that normal promos do NOT trip them
(no crying wolf). Pure read-only; no engine change.
"""
from __future__ import annotations

from app.models import PriceAction, PriceBatch, ProductCost, RunMode, Environment
from app.services import plausibility


def _batch(db) -> PriceBatch:
    b = PriceBatch(
        id="b_plaus", external_id="plaus-test", idempotency_key="idem-plaus",
        name="Plausibility Test", zone="Z", run_mode=RunMode.LIVE_ROLLOUT,
        environment=Environment.SIMULATED_PRODUCTION, total_store_count=4,
    )
    db.add(b)
    db.flush()
    return b


def _action(db, batch, *, sku, store, approved, prior, name="Item"):
    a = PriceAction(
        id=f"a_{sku}_{store}", batch_id=batch.id, sku=sku, product_name=name,
        store_id=store, approved_price=approved, prior_price=prior, reason="test",
    )
    db.add(a)
    db.flush()
    return a


# ── below_cost ─────────────────────────────────────────────────────────
def test_below_cost_is_flagged_critical(db):
    b = _batch(db)
    _action(db, b, sku="milk", store="s1", approved=2.00, prior=3.99, name="Milk")
    db.add(ProductCost(id="c_milk", sku="milk", cost=2.50))  # approved < cost
    db.commit()

    report = plausibility.check_batch(db, b)
    below = [f for f in report.findings if f.code == "below_cost"]
    assert len(below) == 1
    assert below[0].severity == "critical"
    assert below[0].evidence["cost"] == 2.50


def test_priced_above_cost_is_not_flagged(db):
    b = _batch(db)
    _action(db, b, sku="milk", store="s1", approved=3.99, prior=4.50, name="Milk")
    db.add(ProductCost(id="c_milk", sku="milk", cost=2.50))  # healthy margin
    db.commit()

    report = plausibility.check_batch(db, b)
    assert not [f for f in report.findings if f.code == "below_cost"]


def test_no_cost_on_record_stays_silent(db):
    """If we don't know the cost, we don't guess — no false below-cost flag."""
    b = _batch(db)
    _action(db, b, sku="mystery", store="s1", approved=0.99, prior=1.20)
    db.commit()
    report = plausibility.check_batch(db, b)
    assert not [f for f in report.findings if f.code == "below_cost"]


# ── extreme_swing (the decimal slip from the KNOWN_GAP) ────────────────
def test_decimal_slip_drop_is_flagged(db):
    """$4.90 typed as $0.49 — a 90% drop. The exact gap the robustness test
    documented; now it's caught as an extreme swing."""
    b = _batch(db)
    _action(db, b, sku="milk", store="s1", approved=0.49, prior=4.90, name="Milk")
    db.commit()
    report = plausibility.check_batch(db, b)
    swings = [f for f in report.findings if f.code == "extreme_swing"]
    assert len(swings) == 1
    assert "drops" in swings[0].message.lower() or "%" in swings[0].message


def test_extreme_jump_is_flagged(db):
    b = _batch(db)
    _action(db, b, sku="eggs", store="s1", approved=25.00, prior=3.99, name="Eggs")
    db.commit()
    report = plausibility.check_batch(db, b)
    assert [f for f in report.findings if f.code == "extreme_swing"]


def test_normal_promo_does_not_trip_extreme_swing(db):
    """A real 25%-off promo ($3.99 -> $2.99) must NOT be flagged — the guard is
    for errors, not legitimate price moves. No crying wolf."""
    b = _batch(db)
    _action(db, b, sku="oj", store="s1", approved=2.99, prior=3.99, name="OJ")
    db.commit()
    report = plausibility.check_batch(db, b)
    assert not [f for f in report.findings if f.code == "extreme_swing"]


# ── cross_store_outlier (the novel, in-lane signal) ────────────────────
def test_cross_store_outlier_is_flagged(db):
    """Same SKU across 4 stores: three at ~$4.99, one at $0.99. The outlier is
    caught WITHOUT any external reference — the batch is its own baseline."""
    b = _batch(db)
    _action(db, b, sku="milk", store="s1", approved=4.99, prior=5.49, name="Milk")
    _action(db, b, sku="milk", store="s2", approved=4.99, prior=5.49, name="Milk")
    _action(db, b, sku="milk", store="s3", approved=5.09, prior=5.49, name="Milk")
    _action(db, b, sku="milk", store="s4", approved=0.99, prior=5.49, name="Milk")  # outlier
    db.commit()

    report = plausibility.check_batch(db, b)
    outliers = [f for f in report.findings if f.code == "cross_store_outlier"]
    assert len(outliers) == 1
    assert outliers[0].store_id == "s4"
    assert outliers[0].evidence["store_count"] == 4


def test_consistent_cross_store_pricing_is_not_flagged(db):
    """Same SKU priced consistently across stores — no outlier, no flag."""
    b = _batch(db)
    for s in ("s1", "s2", "s3", "s4"):
        _action(db, b, sku="milk", store=s, approved=4.99, prior=5.49, name="Milk")
    db.commit()
    report = plausibility.check_batch(db, b)
    assert not [f for f in report.findings if f.code == "cross_store_outlier"]


def test_too_few_stores_no_outlier_call(db):
    """With only 2 stores there's no stable baseline — we don't call an outlier
    on thin evidence."""
    b = _batch(db)
    _action(db, b, sku="milk", store="s1", approved=4.99, prior=5.49)
    _action(db, b, sku="milk", store="s2", approved=0.99, prior=5.49)
    db.commit()
    report = plausibility.check_batch(db, b)
    assert not [f for f in report.findings if f.code == "cross_store_outlier"]


def test_zone_aware_legit_regional_pricing_is_not_flagged(db):
    """Gap 3: a SKU legitimately priced higher in one zone than another must NOT
    be flagged as an outlier when stores are compared WITHIN their own zone.
    Manhattan stores at $6.99, rural stores at $4.49 — both internally consistent."""
    b = _batch(db)
    actions = [
        _action(db, b, sku="milk", store="mn1", approved=6.99, prior=7.20),
        _action(db, b, sku="milk", store="mn2", approved=6.99, prior=7.20),
        _action(db, b, sku="milk", store="mn3", approved=7.09, prior=7.20),
        _action(db, b, sku="milk", store="ru1", approved=4.49, prior=4.60),
        _action(db, b, sku="milk", store="ru2", approved=4.49, prior=4.60),
        _action(db, b, sku="milk", store="ru3", approved=4.39, prior=4.60),
    ]
    db.commit()
    zone = {"mn1": "Manhattan", "mn2": "Manhattan", "mn3": "Manhattan",
            "ru1": "Rural", "ru2": "Rural", "ru3": "Rural"}
    # Without zones, the cross-zone spread would look like outliers; WITH zones,
    # each cohort is internally consistent → nothing flagged.
    report = plausibility.check_actions(db, actions, store_zone=zone)
    assert not [f for f in report.findings if f.code == "cross_store_outlier"]


def test_zone_aware_still_catches_within_zone_outlier(db):
    """Zone-awareness must not blind the check: an outlier WITHIN a zone is still
    caught. Three Manhattan stores at ~$6.99, one at $0.99 → flagged."""
    b = _batch(db)
    actions = [
        _action(db, b, sku="milk", store="mn1", approved=6.99, prior=7.20),
        _action(db, b, sku="milk", store="mn2", approved=6.99, prior=7.20),
        _action(db, b, sku="milk", store="mn3", approved=7.09, prior=7.20),
        _action(db, b, sku="milk", store="mn4", approved=0.99, prior=7.20),  # in-zone outlier
    ]
    db.commit()
    zone = {s: "Manhattan" for s in ("mn1", "mn2", "mn3", "mn4")}
    report = plausibility.check_actions(db, actions, store_zone=zone)
    outliers = [f for f in report.findings if f.code == "cross_store_outlier"]
    assert len(outliers) == 1
    assert outliers[0].store_id == "mn4"
    assert outliers[0].evidence["zone"] == "Manhattan"


# ── report shape + a clean batch ───────────────────────────────────────
def test_clean_batch_has_zero_findings(db):
    b = _batch(db)
    for s in ("s1", "s2", "s3"):
        _action(db, b, sku="oj", store=s, approved=2.99, prior=3.49, name="OJ")
    db.add(ProductCost(id="c_oj", sku="oj", cost=1.50))  # one cost row — sku is unique
    db.commit()
    report = plausibility.check_batch(db, b)
    assert report.findings == []
    assert report.flagged_actions == 0
    assert report.critical_count == 0
    d = report.to_dict()
    assert d["checked_actions"] == 3 and d["findings"] == []


def test_one_action_can_carry_multiple_findings(db):
    """A row that is BOTH below cost AND an extreme drop is a stronger signal —
    the report surfaces both, not just the first."""
    b = _batch(db)
    # 4 stores so the cross-store baseline exists; s4 is below cost AND a slip.
    _action(db, b, sku="milk", store="s1", approved=4.99, prior=5.49, name="Milk")
    _action(db, b, sku="milk", store="s2", approved=4.99, prior=5.49, name="Milk")
    _action(db, b, sku="milk", store="s3", approved=5.09, prior=5.49, name="Milk")
    _action(db, b, sku="milk", store="s4", approved=0.49, prior=5.49, name="Milk")
    db.add(ProductCost(id="c_milk", sku="milk", cost=2.50))
    db.commit()

    report = plausibility.check_batch(db, b)
    s4 = [f for f in report.findings if f.store_id == "s4"]
    codes = {f.code for f in s4}
    # below cost ($0.49 < $2.50), extreme drop (91%), AND cross-store outlier.
    assert "below_cost" in codes
    assert "extreme_swing" in codes
    assert "cross_store_outlier" in codes
    assert report.critical_count >= 1
