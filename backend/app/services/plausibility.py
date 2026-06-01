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
    if ratio <= EXTREME_DROP_RATIO:
        drop_pct = round((1 - ratio) * 100, 1)
        return PlausibilityFinding(
            action_id=action.id, sku=action.sku, store_id=action.store_id,
            product_name=action.product_name, approved_price=approved,
            code="extreme_swing", severity="warning",
            message=(
                f"{action.product_name} at Store {action.store_id} drops {drop_pct:.0f}% — "
                f"approved ${approved:.2f} vs prior ${prior:.2f}. Beyond a normal promo; "
                f"possible decimal slip (e.g. ${prior:.2f} typed as ${approved:.2f})."
            ),
            evidence={"approved_price": approved, "prior_price": prior, "ratio": round(ratio, 4)},
        )
    if ratio >= EXTREME_JUMP_RATIO:
        jump_x = round(ratio, 1)
        return PlausibilityFinding(
            action_id=action.id, sku=action.sku, store_id=action.store_id,
            product_name=action.product_name, approved_price=approved,
            code="extreme_swing", severity="warning",
            message=(
                f"{action.product_name} at Store {action.store_id} jumps {jump_x}× — "
                f"approved ${approved:.2f} vs prior ${prior:.2f}. Beyond a normal change; "
                f"possible fat-finger or decimal slip."
            ),
            evidence={"approved_price": approved, "prior_price": prior, "ratio": round(ratio, 4)},
        )
    return None


def _check_cross_store_outliers(actions: list[PriceAction]) -> list[PlausibilityFinding]:
    """The novel, in-lane signal: within ONE batch the same SKU should be priced
    consistently across stores (zone pricing aside). If one store is a wild
    outlier vs its siblings' median, that store's feed is suspect — and we know
    this WITHOUT any external reference, because the batch is its own baseline.
    """
    findings: list[PlausibilityFinding] = []
    by_sku: dict[str, list[PriceAction]] = {}
    for a in actions:
        if a.approved_price and a.approved_price > 0:
            by_sku.setdefault(a.sku, []).append(a)

    for sku, group in by_sku.items():
        if len(group) < OUTLIER_MIN_STORES:
            continue  # too few stores to call any one an outlier with confidence
        prices = [a.approved_price for a in group]
        med = median(prices)
        if med <= 0:
            continue
        for a in group:
            deviation = abs(a.approved_price - med) / med
            if deviation > OUTLIER_DEVIATION:
                findings.append(PlausibilityFinding(
                    action_id=a.id, sku=a.sku, store_id=a.store_id,
                    product_name=a.product_name, approved_price=a.approved_price,
                    code="cross_store_outlier", severity="critical",
                    message=(
                        f"{a.product_name} is approved at ${a.approved_price:.2f} at "
                        f"Store {a.store_id}, but the median across {len(group)} stores in "
                        f"this batch is ${med:.2f} ({round(deviation * 100)}% off). One "
                        f"store's price disagrees with its siblings — likely a feed error."
                    ),
                    evidence={"approved_price": a.approved_price, "batch_median": med,
                              "store_count": len(group), "deviation_pct": round(deviation * 100, 1)},
                ))
    return findings


def check_actions(db: Session, actions: list[PriceAction], batch_external_id: str = "") -> PlausibilityReport:
    """Run all plausibility checks over a set of approved actions. Pure read.

    Per-action checks (below_cost, extreme_swing) plus the batch-relative
    cross_store_outlier check. Returns every finding; an action can carry more
    than one (e.g. below cost AND a cross-store outlier), which is itself a
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
    findings.extend(_check_cross_store_outliers(actions))
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
