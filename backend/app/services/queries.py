from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ActionDecision,
    AuditEvent,
    BatchStatus,
    Incident,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    PriceAction,
    PriceBatch,
)
from app.schemas import (
    ActionView,
    AuditEventView,
    BatchDetail,
    BatchLifecycleView,
    BatchSummary,
    ChannelView,
    IncidentExplanation,
    IncidentView,
    MeasurementEligibilityView,
    OperationsOverview,
)
from app.services import measurement
from app.services.measurement import MeasurementEligibility

CHANNEL_ORDER = {"pos": 0, "esl": 1, "ecommerce": 2}

# A perishable markdown enters the "at risk" band once it's inside this window
# of its sell-through deadline and the shelf label still hasn't acknowledged.
# Kept in sync with the frontend's "act" urgency threshold so the server-side
# SLA status and the client-side countdown badge classify identically.
SLA_AT_RISK_WINDOW_MINUTES = 120


def _ensure_utc(dt: datetime) -> datetime:
    """Normalise a possibly-naive DB datetime to UTC.

    Postgres returns tz-aware datetimes; SQLite (local/tests) hands back naive
    ones. Treat naive values as UTC so deadline math is consistent everywhere.
    """
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _channels_for(action: PriceAction) -> list[ChannelView]:
    views: list[ChannelView] = []
    for d in action.deliveries:
        receipt = d.receipt
        if receipt is None:
            views.append(
                ChannelView(
                    channel=d.channel.value,
                    status="pending",
                    expected_price=action.approved_price,
                    observed_price=None,
                    attempts=d.attempts,
                )
            )
        else:
            views.append(
                ChannelView(
                    channel=d.channel.value,
                    status=receipt.status.value,
                    expected_price=receipt.expected_price,
                    observed_price=receipt.observed_price,
                    attempts=d.attempts,
                )
            )
    views.sort(key=lambda v: CHANNEL_ORDER.get(v.channel, 9))
    return views


def action_view(
    action: PriceAction,
    eligibility: measurement.EligibilityResult | None = None,
) -> ActionView:
    """Build the read-only action view. ``eligibility`` is optional — when not
    provided the view simply omits it (forward-compatible). Callers that loop
    over a batch should pre-compute eligibilities via
    :func:`measurement.derive_eligibility_for_batch` to avoid N+1 queries."""
    eligibility_view: MeasurementEligibilityView | None = None
    if eligibility is not None:
        eligibility_view = MeasurementEligibilityView(**eligibility.to_dict())
    return ActionView(
        id=action.id,
        sku=action.sku,
        product_name=action.product_name,
        store_id=action.store_id,
        approved_price=action.approved_price,
        prior_price=action.prior_price,
        reason=action.reason,
        is_kvi=action.is_kvi,
        is_perishable=action.is_perishable,
        markdown_deadline=action.markdown_deadline,
        projected_impact=action.projected_impact,
        decision=action.decision.value,
        channels=_channels_for(action),
        measurement_eligibility=eligibility_view,
    )


def _canary_ids(batch: PriceBatch) -> list[str]:
    g = next((g for g in batch.rollout_groups if g.kind == "canary"), None)
    return g.store_ids if g else []


def _expansion_ids(batch: PriceBatch) -> list[str]:
    g = next((g for g in batch.rollout_groups if g.kind == "expansion"), None)
    return g.store_ids if g else []


def batch_summary(db: Session, batch: PriceBatch) -> BatchSummary:
    canary = set(_canary_ids(batch))
    canary_actions = [a for a in batch.actions if a.store_id in canary]
    # Counts span every action (canary + expanded) so the totals stay accurate
    # through expansion; the canary verification ratio is derived in the overview.
    verified = sum(1 for a in batch.actions if a.decision == ActionDecision.ELIGIBLE)
    blocked = sum(1 for a in batch.actions if a.decision == ActionDecision.BLOCKED)
    retrying = sum(1 for a in batch.actions if a.decision == ActionDecision.RETRY)

    open_incidents = list(
        db.scalars(
            select(Incident).where(
                Incident.batch_id == batch.id,
                Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]),
            )
        )
    )
    critical = sum(1 for i in open_incidents if i.severity == IncidentSeverity.CRITICAL)
    deadline = sum(1 for i in open_incidents if i.type == IncidentType.DEADLINE_RISK)

    return BatchSummary(
        id=batch.id,
        external_id=batch.external_id,
        name=batch.name,
        zone=batch.zone,
        status=batch.status.value,
        approved_by=batch.approved_by,
        total_store_count=batch.total_store_count,
        canary_store_ids=_canary_ids(batch),
        expansion_store_ids=_expansion_ids(batch),
        expansion_blocked=batch.expansion_blocked,
        block_reason=batch.block_reason,
        created_at=batch.created_at,
        total_actions=len(batch.actions),
        canary_action_count=len(canary_actions),
        verified_actions=verified,
        blocked_actions=blocked,
        retry_actions=retrying,
        critical_incidents=critical,
        deadline_risks=deadline,
    )


def batch_lifecycle(db: Session, batch: PriceBatch) -> BatchLifecycleView:
    """Roll the per-action lifecycle up to the batch level — the post-export view.

    Pure derivation, identical discipline to :mod:`app.services.measurement` and
    :mod:`app.services.receipt`: no new tables, no writes, no audit events. Every
    count reuses an existing per-action predicate so the batch view can never
    disagree with the Decision Receipt:

      * ``published`` — :func:`app.services.receipt.action_published` (deliveries
        exist and none are still queued in the outbox). One shared predicate, so
        the rail's *Published* stage and this count always agree.
      * ``verified``  — every *required* channel reconciled to the approved price,
        read from the same eligibility derivation the *Verified* stage uses
        (``verified_channels == required_channels`` with at least one channel).
      * ``measured``  — ``ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED`` from
        :func:`measurement.derive_eligibility_for_batch` (two bounded queries).

    Counts span every action in the batch (canary + expansion), so ``exported``
    is the full approved set and the post-export shrinkage is visible. An
    expansion action that hasn't been dispatched yet has no deliveries, so it
    counts toward ``exported`` but not ``published`` — exactly the gap this view
    exists to surface. Empty batches return all-zero counts (no div-by-zero)."""
    from app.services.receipt import action_published

    # One bounded pair of queries for the whole batch — no N+1 in the loop.
    eligibility_map = measurement.derive_eligibility_for_batch(db, batch)

    total = len(batch.actions)
    published = 0
    verified = 0
    measured = 0
    for a in batch.actions:
        elig = eligibility_map.get(a.id)
        if action_published(a):
            published += 1
        # Verified reuses the eligibility derivation's channel tally so it stays
        # in lockstep with the receipt's Verified stage: all required channels
        # reconciled, at least one channel required.
        if (
            elig is not None
            and elig.required_channels
            and len(elig.verified_channels) == len(elig.required_channels)
        ):
            verified += 1
        if (
            elig is not None
            and elig.status
            == MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED
        ):
            measured += 1

    summary = (
        f"{total} exported · {published} published · "
        f"{verified} verified · {measured} measurement-eligible"
    )
    return BatchLifecycleView(
        exported=total,
        published=published,
        verified=verified,
        measured=measured,
        total=total,
        summary=summary,
    )


def batch_detail(db: Session, batch: PriceBatch) -> BatchDetail:
    summary = batch_summary(db, batch)
    canary = set(_canary_ids(batch))
    expansion_active = (
        batch.status in {BatchStatus.EXPANDING, BatchStatus.COMPLETED}
        or any(g.kind == "expansion" and g.active for g in batch.rollout_groups)
    )
    scoped_actions = list(batch.actions) if expansion_active else [
        a for a in batch.actions if a.store_id in canary
    ]
    actions = sorted(
        scoped_actions,
        key=lambda a: (a.product_name, a.store_id),
    )
    # Two bounded queries, then in-memory lookup per action — no N+1.
    eligibility_map = measurement.derive_eligibility_for_batch(db, batch)
    return BatchDetail(
        **summary.model_dump(),
        actions=[action_view(a, eligibility_map.get(a.id)) for a in actions],
        lifecycle=batch_lifecycle(db, batch),
    )


def incident_view(db: Session, incident: Incident) -> IncidentView:
    action = db.get(PriceAction, incident.action_id)
    batch = db.get(PriceBatch, incident.batch_id)
    channels = _channels_for(action)
    observed = None
    if incident.offending_channel is not None:
        observed = next(
            (c.observed_price for c in channels if c.channel == incident.offending_channel.value),
            None,
        )
    # Two bounded queries (incidents + store tasks for this one action).
    eligibility = measurement.derive_eligibility_for_action(db, action)
    return IncidentView(
        id=incident.id,
        batch_id=incident.batch_id,
        batch_external_id=batch.external_id if batch else "",
        zone=batch.zone if batch else "",
        action_id=incident.action_id,
        type=incident.type.value,
        severity=incident.severity.value,
        status=incident.status.value,
        summary=incident.summary,
        offending_channel=incident.offending_channel.value if incident.offending_channel else None,
        product_name=action.product_name,
        sku=action.sku,
        store_id=action.store_id,
        approved_price=action.approved_price,
        observed_price=observed,
        created_at=incident.created_at,
        resolved_at=incident.resolved_at,
        channels=channels,
        measurement_eligibility=MeasurementEligibilityView(**eligibility.to_dict()),
    )


def incident_explanation(db: Session, incident: Incident) -> IncidentExplanation:
    action = db.get(PriceAction, incident.action_id)
    channels = _channels_for(action)
    offending = incident.offending_channel.value.upper() if incident.offending_channel else "a channel"

    if incident.type == IncidentType.PRICE_MISMATCH:
        what = (
            f"The approved price of ${action.approved_price:.2f} for {action.product_name} was "
            f"applied to the shelf label and ecommerce channels, but the {offending} system at "
            f"Store {action.store_id} still reports the prior price."
        )
        why = (
            f"A shopper could see ${action.approved_price:.2f} on the shelf and online but be charged "
            f"a higher price at checkout. Price inconsistencies erode trust and can spread across the "
            f"zone if the rollout expands."
        )
        actions = [
            f"Retry the {offending} update for Store {action.store_id}.",
            f"Verify {offending} now matches the approved price (${action.approved_price:.2f}).",
            "If the mismatch persists, temporarily roll back the shelf label to match checkout.",
            "Confirm all three channels are aligned.",
            "Resolve the incident to make this action eligible for expansion.",
        ]
    elif incident.type == IncidentType.DEADLINE_RISK:
        what = (
            f"The markdown to ${action.approved_price:.2f} for {action.product_name} was confirmed on "
            f"other channels, but the {offending} shelf label at Store {action.store_id} did not "
            f"acknowledge the update."
        )
        why = (
            "The markdown may not be visible to in-store shoppers before the sell-through deadline, "
            "risking unsold perishable inventory and lost margin."
        )
        actions = [
            f"Retry the {offending} shelf-label update for Store {action.store_id}.",
            "If no acknowledgement, create an associate verification task.",
            "Confirm the shelf label shows the markdown before the deadline.",
            "Resolve once verified.",
        ]
    else:
        what = (
            f"The {offending} update for {action.product_name} at Store {action.store_id} was not "
            f"acknowledged within the expected window."
        )
        why = "Until the channel confirms, this action cannot be safely expanded to other stores."
        actions = [
            f"Retry the {offending} update.",
            "Create a store verification task if the channel keeps timing out.",
            "Resolve once acknowledged.",
        ]

    return IncidentExplanation(
        incident_id=incident.id,
        what_happened=what,
        why_it_matters=why,
        recommended_next_actions=actions,
        channels=channels,
    )


def recent_audit(db: Session, batch_id: str, limit: int = 10) -> list[AuditEventView]:
    rows = list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.batch_id == batch_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(limit)
        )
    )
    return [
        AuditEventView(id=r.id, event=r.event, detail=r.detail, actor=r.actor, created_at=r.created_at)
        for r in rows
    ]


def operations_overview(db: Session, batch: PriceBatch) -> OperationsOverview:
    summary = batch_summary(db, batch)

    critical = db.scalar(
        select(Incident).where(
            Incident.batch_id == batch.id,
            Incident.severity == IncidentSeverity.CRITICAL,
            Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]),
        )
    )
    deadline = db.scalar(
        select(Incident).where(
            Incident.batch_id == batch.id,
            Incident.type == IncidentType.DEADLINE_RISK,
            Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.RETRYING]),
        )
    )

    canary = set(_canary_ids(batch))
    eligible = next(
        (a for a in batch.actions if a.store_id in canary and a.decision == ActionDecision.ELIGIBLE),
        None,
    )
    # Pre-compute eligibility once for the whole batch so the highlighted
    # ``eligible_action`` in the overview carries its measurement-eligibility
    # signal in O(1) lookup (no extra query per action).
    eligibility_map = measurement.derive_eligibility_for_batch(db, batch) if eligible else {}

    # The progress ring scopes to the canary set until expansion is active, then
    # to the whole batch — so it always reads against the actions in flight.
    expansion_active = any(g.kind == "expansion" and g.active for g in batch.rollout_groups)
    scope = list(batch.actions) if expansion_active else [a for a in batch.actions if a.store_id in canary]
    total = len(scope) or 1
    verified = sum(1 for a in scope if a.decision == ActionDecision.ELIGIBLE)
    blocked = sum(1 for a in scope if a.decision == ActionDecision.BLOCKED)
    pending = total - verified - blocked
    progress = {
        "verified": verified,
        "blocked": blocked,
        "pending": max(pending, 0),
        "total": total,
        "verified_pct": round(100 * verified / total, 1),
    }

    return OperationsOverview(
        batch=summary,
        critical_incident=incident_view(db, critical) if critical else None,
        deadline_risk=incident_view(db, deadline) if deadline else None,
        eligible_action=(
            action_view(eligible, eligibility_map.get(eligible.id)) if eligible else None
        ),
        recent_activity=recent_audit(db, batch.id),
        rollout_progress=progress,
    )


def empty_markdown_sla() -> dict:
    """The zeroed SLA payload returned when no batch exists in the requested
    scope. Lets the frontend render a clean "no markdowns" state instead of
    treating an empty live scope as an error."""
    return {
        "zone": None,
        "markdowns": [],
        "summary": {
            "total": 0,
            "met": 0,
            "at_risk": 0,
            "breached": 0,
            "pending": 0,
            "compliance_pct": 100.0,
            "soonest_unmet_deadline": None,
            "soonest_unmet_sku": None,
        },
    }


def markdown_sla(db: Session, batch: PriceBatch, now: datetime | None = None) -> dict:
    """Perishable-markdown reliability, framed as an SLA.

    The SLA: for every perishable markdown, the shelf label (ESL) must
    acknowledge the approved markdown *before* the sell-through deadline —
    otherwise in-store shoppers can't see the lower price in time and the
    inventory risks going unsold at full margin loss.

    Each markdown is classified against real reconciliation state:
      • ``met``      — ESL is verified; the shelf reflects the markdown now.
      • ``breached`` — deadline has passed and the ESL still isn't verified.
      • ``at_risk``  — deadline is inside the at-risk window, ESL not verified.
      • ``pending``  — ESL not verified yet but the deadline is comfortably out.

    ``compliance_pct`` is the share of perishable markdowns currently met.
    ``now`` is injectable so tests can pin deterministic deadline math.
    """
    now = now or datetime.now(timezone.utc)
    canary = set(_canary_ids(batch))
    rows = [
        a
        for a in batch.actions
        if a.is_perishable and a.markdown_deadline and a.store_id in canary
    ]

    items: list[dict] = []
    counts = {"met": 0, "at_risk": 0, "breached": 0, "pending": 0}
    soonest: tuple[datetime, str] | None = None  # most urgent UNMET deadline

    for a in sorted(rows, key=lambda x: (_ensure_utc(x.markdown_deadline), x.store_id)):
        view = action_view(a)
        esl = next((c for c in view.channels if c.channel == "esl"), None)
        esl_verified = esl is not None and esl.status == "verified"
        deadline = _ensure_utc(a.markdown_deadline)
        minutes_remaining = (deadline - now).total_seconds() / 60.0

        if esl_verified:
            status = "met"
        elif minutes_remaining <= 0:
            status = "breached"
        elif minutes_remaining <= SLA_AT_RISK_WINDOW_MINUTES:
            status = "at_risk"
        else:
            status = "pending"
        counts[status] += 1

        if not esl_verified and (soonest is None or deadline < soonest[0]):
            soonest = (deadline, a.sku)

        items.append(
            {
                "action": view.model_dump(),
                "markdown_deadline": a.markdown_deadline,
                "sla_status": status,
                "esl_verified": esl_verified,
                "minutes_remaining": round(minutes_remaining, 1),
            }
        )

    total = len(items)
    compliance_pct = round(100 * counts["met"] / total, 1) if total else 100.0

    return {
        "zone": batch.zone,
        "markdowns": items,
        "summary": {
            "total": total,
            "met": counts["met"],
            "at_risk": counts["at_risk"],
            "breached": counts["breached"],
            "pending": counts["pending"],
            "compliance_pct": compliance_pct,
            "soonest_unmet_deadline": soonest[0].isoformat() if soonest else None,
            "soonest_unmet_sku": soonest[1] if soonest else None,
        },
    }
