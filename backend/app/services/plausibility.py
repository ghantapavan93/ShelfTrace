"""Execution-integrity plausibility guard — flag approved prices that look like
DATA ERRORS before they reach a shopper.

This is ShelfTrace's lane, and deliberately NOT BetterBasket's. It does not
recommend or decide a price (that is the upstream pricing system / Athena). It
answers a different, narrower question:

    "Does this *approved* price look like a typo or a broken feed that would
     charge a shopper the wrong amount — and should a human look before it
     rolls out?"

Every finding is a FLAG with EVIDENCE, never an auto-correction. The checks are
pure deterministic rules over data the system already holds (no LLM, no black
box, fully explainable) — so a reviewer can see exactly why each one fired.

Discipline (mirrors measurement.py / receipt.py): pure derivation. No new
tables, no writes, no audit events. Read existing rows, return findings.

Three independent signals, each catching a different failure mode:

  1. below_cost          — approved price is at or under known unit cost
                           (selling at a loss; almost always an error or needs
                           explicit sign-off). Uses ProductCost.
  2. extreme_swing       — approved price is a >=80% drop or >=5x jump vs the
                           prior price (a decimal slip — $4.90 typed $0.49 — or
                           a fat-finger). Beyond any normal promo. Uses prior.
  3. cross_store_outlier — within ONE approved batch, the same SKU is priced
                           wildly differently at one store vs its siblings (a
                           per-store feed error). Needs no external reference —
                           the batch is its own baseline. The novel signal.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PriceAction, PriceBatch, ProductCost

# ── Tuned thresholds. Conservative on purpose: a flag means "a human should
#    look," so we'd rather miss a borderline case than cry wolf on a real promo.
EXTREME_DROP_RATIO = 0.20   # approved <= 20% of prior  => >=80% off (not a promo)
EXTREME_JUMP_RATIO = 5.0    # approved >= 5x prior       (matches the import guard)
OUTLIER_MIN_STORES = 3      # need >=3 stores for a stable per-SKU baseline
OUTLIER_DEVIATION = 0.40    # >40% off the sibling median => suspicious outlier


@dataclass
class PlausibilityFinding:
    action_id: str
    sku: str
    store_id: str
    product_name: str
    approved_price: float
    code: str          # "below_cost" | "extreme_swing" | "cross_store_outlier"
    severity: str      # "critical" | "warning"
    message: str       # human-readable, with the numbers inline
    evidence: dict = field(default_factory=dict)  # the raw figures behind it


@dataclass
class PlausibilityReport:
    batch_external_id: str
    checked_actions: int
    findings: list[PlausibilityFinding]

    @property
    def flagged_actions(self) -> int:
        return len({f.action_id for f in self.findings})

    @property
    def critical_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "critical")

    def to_dict(self) -> dict:
        return {
            "batch_external_id": self.batch_external_id,
            "checked_actions": self.checked_actions,
            "flagged_actions": self.flagged_actions,
            "critical_count": self.critical_count,
            "findings": [asdict(f) for f in self.findings],
        }


def _cost_index(db: Session, skus: set[str]) -> dict[str, float]:
    """One bounded query for the costs of every SKU in the batch (no N+1)."""
    if not skus:
        return {}
    rows = db.scalars(select(ProductCost).where(ProductCost.sku.in_(skus))).all()
    # ProductCost.sku is unique, so last-wins is fine; keep the lowest if dupes.
    out: dict[str, float] = {}
    for r in rows:
        out[r.sku] = min(out.get(r.sku, r.cost), r.cost)
    return out


def _check_below_cost(action: PriceAction, cost: float | None) -> PlausibilityFinding | None:
    if cost is None or cost <= 0:
        return None  # no cost on record → can't judge; stay silent, don't guess
    if action.approved_price <= cost:
        margin_pct = round((action.approved_price - cost) / action.approved_price * 100, 1) \
            if action.approved_price > 0 else -100.0
        return PlausibilityFinding(
            action_id=action.id, sku=action.sku, store_id=action.store_id,
            product_name=action.product_name, approved_price=action.approved_price,
            code="below_cost", severity="critical",
            message=(
                f"{action.product_name} at Store {action.store_id} is approved at "
                f"${action.approved_price:.2f}, at or below its unit cost ${cost:.2f} "
                f"(margin {margin_pct:.1f}%). Likely a data error — selling at a loss."
            ),
            evidence={"approved_price": action.approved_price, "cost": cost,
                      "margin_pct": margin_pct},
        )
    return None


def _check_extreme_swing(action: PriceAction) -> PlausibilityFinding | None:
    prior = action.prior_price
    approved = action.approved_price
    if prior is None or prior <= 0 or approved <= 0:
        return None
    ratio = approved / prior
    # These thresholds (>=80% drop, >=5x jump) are already far beyond any normal
    # promo or markup, so an extreme swing is a probable DATA ERROR — critical,
    # and it gates the rollout. The textbook case is a decimal slip ($4.90 typed
    # as $0.49). A subtler "is this right?" band would be a separate warning;
    # here, crossing the extreme line means stop-and-check.
    if ratio <= EXTREME_DROP_RATIO:
        drop_pct = round((1 - ratio) * 100, 1)
        return PlausibilityFinding(
            action_id=action.id, sku=action.sku, store_id=action.store_id,
            product_name=action.product_name, approved_price=approved,
            code="extreme_swing", severity="critical",
            message=(
                f"{action.product_name} at Store {action.store_id} drops {drop_pct:.0f}% — "
                f"approved ${approved:.2f} vs prior ${prior:.2f}. Beyond a normal promo; "
                f"likely a decimal slip (e.g. ${prior:.2f} typed as ${approved:.2f})."
            ),
            evidence={"approved_price": approved, "prior_price": prior, "ratio": round(ratio, 4)},
        )
    if ratio >= EXTREME_JUMP_RATIO:
        jump_x = round(ratio, 1)
        return PlausibilityFinding(
            action_id=action.id, sku=action.sku, store_id=action.store_id,
            product_name=action.product_name, approved_price=approved,
            code="extreme_swing", severity="critical",
            message=(
                f"{action.product_name} at Store {action.store_id} jumps {jump_x}× — "
                f"approved ${approved:.2f} vs prior ${prior:.2f}. Beyond a normal change; "
                f"likely a fat-finger or decimal slip."
            ),
            evidence={"approved_price": approved, "prior_price": prior, "ratio": round(ratio, 4)},
        )
    return None


def _check_cross_store_outliers(
    actions: list[PriceAction],
    store_zone: dict[str, str] | None = None,
) -> list[PlausibilityFinding]:
    """The novel, in-lane signal: the same SKU should be priced consistently
    across stores in the SAME pricing zone/tier. If one store is a wild outlier
    vs its zone siblings' median, that store's feed is suspect — and we know this
    WITHOUT any external reference, because the zone cohort is its own baseline.

    Zone-aware (Gap 3): grocers price by region/tier on purpose — Manhattan milk
    legitimately differs from a rural store. ``store_zone`` maps store_id -> zone
    so we compare within a zone, never across. When it's omitted (or a store is
    unmapped) every store falls into one default cohort, which is correct for a
    single-zone batch — the common case — and avoids flagging legitimate regional
    pricing as an error.
    """
    store_zone = store_zone or {}
    findings: list[PlausibilityFinding] = []
    # Cohort key is (sku, zone) so a SKU priced differently per zone is fine; only
    # a divergence WITHIN one zone's stores is suspect.
    by_cohort: dict[tuple[str, str], list[PriceAction]] = {}
    for a in actions:
        if a.approved_price and a.approved_price > 0:
            zone = store_zone.get(a.store_id, "__default__")
            by_cohort.setdefault((a.sku, zone), []).append(a)

    for (sku, zone), group in by_cohort.items():
        if len(group) < OUTLIER_MIN_STORES:
            continue  # too few stores in this zone to call an outlier with confidence
        prices = [a.approved_price for a in group]
        med = median(prices)
        if med <= 0:
            continue
        zone_label = "" if zone == "__default__" else f" in {zone}"
        for a in group:
            deviation = abs(a.approved_price - med) / med
            if deviation > OUTLIER_DEVIATION:
                findings.append(PlausibilityFinding(
                    action_id=a.id, sku=a.sku, store_id=a.store_id,
                    product_name=a.product_name, approved_price=a.approved_price,
                    code="cross_store_outlier", severity="critical",
                    message=(
                        f"{a.product_name} is approved at ${a.approved_price:.2f} at "
                        f"Store {a.store_id}, but the median across {len(group)} stores"
                        f"{zone_label} is ${med:.2f} ({round(deviation * 100)}% off). One "
                        f"store's price disagrees with its same-zone siblings — likely a feed error."
                    ),
                    evidence={"approved_price": a.approved_price, "zone_median": med,
                              "zone": zone if zone != "__default__" else None,
                              "store_count": len(group), "deviation_pct": round(deviation * 100, 1)},
                ))
    return findings


def check_actions(
    db: Session,
    actions: list[PriceAction],
    batch_external_id: str = "",
    store_zone: dict[str, str] | None = None,
) -> PlausibilityReport:
    """Run all plausibility checks over a set of approved actions. Pure read.

    Per-action checks (below_cost, extreme_swing) plus the zone-aware
    cross_store_outlier check. ``store_zone`` (store_id -> zone) keeps the outlier
    comparison within a pricing zone so legitimate regional pricing isn't flagged;
    omit it for a single-zone batch. Returns every finding; an action can carry
    more than one (e.g. below cost AND a cross-store outlier), which is itself a
    stronger signal that the row is bad.
    """
    costs = _cost_index(db, {a.sku for a in actions})
    findings: list[PlausibilityFinding] = []
    for a in actions:
        bc = _check_below_cost(a, costs.get(a.sku))
        if bc:
            findings.append(bc)
        sw = _check_extreme_swing(a)
        if sw:
            findings.append(sw)
    findings.extend(_check_cross_store_outliers(actions, store_zone))
    # Stable, reviewer-friendly order: critical first, then by store/sku.
    findings.sort(key=lambda f: (f.severity != "critical", f.store_id, f.sku, f.code))
    return PlausibilityReport(
        batch_external_id=batch_external_id,
        checked_actions=len(actions),
        findings=findings,
    )


def check_batch(db: Session, batch: PriceBatch) -> PlausibilityReport:
    """Convenience wrapper: plausibility report for every action in a batch."""
    actions = db.scalars(select(PriceAction).where(PriceAction.batch_id == batch.id)).all()
    return check_actions(db, list(actions), batch_external_id=batch.external_id)


def enforce_gate(db: Session, batch: PriceBatch) -> int:
    """Turn the advisory report into a real GATE: for every CRITICAL finding,
    open an IMPLAUSIBLE_PRICE incident on that action and BLOCK the batch, so a
    bad number is held before it rolls out — not merely reported.

    Pure, idempotent, and additive: it never duplicates an existing open
    IMPLAUSIBLE_PRICE incident for the same action, writes an audit event for
    each new one, and leaves the proven reconciliation engine untouched (this
    runs alongside it, keying only on plausibility findings). Warnings are left
    advisory — only critical findings gate. Returns the number of new incidents.

    Called from execute_live() after the outbox drains, behind
    settings.plausibility_gate_enabled.
    """
    # Local imports keep this module dependency-light and avoid an import cycle
    # with the recovery/reconciliation services.
    from app.ids import new_id
    from app.models import (
        ActionDecision,
        BatchStatus,
        Incident,
        IncidentSeverity,
        IncidentStatus,
        IncidentType,
    )
    from app.services.audit import record_audit

    report = check_actions(
        db,
        list(db.scalars(select(PriceAction).where(PriceAction.batch_id == batch.id))),
        batch_external_id=batch.external_id,
    )
    critical = [f for f in report.findings if f.severity == "critical"]
    if not critical:
        return 0

    opened = 0
    for finding in critical:
        # Idempotent: skip if this action already has an open implausible-price
        # incident (re-running execute_live must not pile up duplicates).
        existing = db.scalar(
            select(Incident).where(
                Incident.action_id == finding.action_id,
                Incident.type == IncidentType.IMPLAUSIBLE_PRICE,
                Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]),
            )
        )
        if existing is not None:
            continue
        action = db.get(PriceAction, finding.action_id)
        if action is None:
            continue
        incident = Incident(
            id=new_id("inc"),
            batch_id=batch.id,
            action_id=action.id,
            type=IncidentType.IMPLAUSIBLE_PRICE,
            severity=IncidentSeverity.CRITICAL,
            status=IncidentStatus.OPEN,
            summary=finding.message,
            offending_channel=None,  # this is a data-quality issue, not a channel
        )
        db.add(incident)
        # Hold the action: it must not roll out on a price that looks wrong.
        action.decision = ActionDecision.BLOCKED
        record_audit(
            db,
            incident_id=incident.id,
            action_id=action.id,
            batch_id=batch.id,
            event="Plausibility gate blocked an implausible price",
            detail=finding.message,
            actor="system",
        )
        opened += 1

    if opened:
        # One bad approved price holds the batch, same containment guarantee as a
        # canary mismatch — the rollout cannot widen on a suspect number.
        batch.status = BatchStatus.BLOCKED
        batch.expansion_blocked = True
        db.commit()
    return opened
