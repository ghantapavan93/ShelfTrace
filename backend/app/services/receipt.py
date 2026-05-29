"""Decision Receipt — the connective evidence object for one price action.

A receipt threads the full lifecycle of an approved price into a single causal
record so a reviewer can answer, for any action: *was this executed correctly,
and is the resulting performance data trustworthy?*

The rail (canonical order):

    Signal → Match → Approved → Certified → Published → Verified → Measured → Learned

This module is **pure derivation**, identical in discipline to
:mod:`app.services.measurement`:

  * No new tables, no migrations, no new write paths, no new audit events.
  * Every value is read from rows the validated core already maintains:
    ``PriceAction`` (+ deliveries + receipts), ``PriceBatch``,
    ``ConnectorProfile``, ``SKUProductLink``/``ProductEntity`` (optional
    enrichment), ``Incident``, ``StoreTask``, ``AuditEvent``.
  * Honest about its own limits: the *Match* stage marks itself
    ``not_applicable`` when a SKU has no canonical entity link (the product
    graph is an optional, heuristic layer), and the *Certified* stage marks
    itself ``not_applicable`` for the simulator (no real connector to certify).

Query cost is bounded for a single-action receipt (a handful of keyed lookups);
it is intended for the detail/drawer surfaces, not list pages.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    ConnectorProfile,
    ConnectorStatus,
    DeliveryStatus,
    Incident,
    IncidentStatus,
    PriceAction,
    PriceBatch,
    ProductEntity,
    SKUProductLink,
    StoreTask,
    StoreTaskStatus,
)
from app.schemas import (
    AuditEventView,
    ChannelView,
    DecisionReceiptView,
    IncidentRefView,
    MeasurementEligibilityView,
    ReceiptEvidenceItem,
    ReceiptStageView,
)
from app.services import measurement, queries
from app.services.measurement import EligibilityResult, MeasurementEligibility

# Canonical lifecycle order. The rail renders in exactly this sequence.
STAGE_ORDER = [
    "signal",
    "match",
    "approved",
    "certified",
    "published",
    "verified",
    "measured",
    "learned",
]

# Substrings that mark an audit event as a recovery/intervention so the final
# stage can surface the operator trail. Matched case-insensitively.
_RECOVERY_HINTS = (
    "retry",
    "rolled back",
    "rollback",
    "resolved",
    "verification task",
    "acknowledgement received",
)


# ---------------------------------------------------------------------------
# Small formatting + tone helpers
# ---------------------------------------------------------------------------
def _money(v: float | None) -> str:
    return "—" if v is None else f"${v:,.2f}"


def _state_tone(state: str) -> str | None:
    return {
        "verified": "verified",
        "failed": "danger",
        "active": "warn",
        "pending": "warn",
        "excluded": "violet",
        "not_applicable": "muted",
    }.get(state)


def _channel_tone(status: str) -> str | None:
    return {
        "verified": "verified",
        "mismatch": "danger",
        "timeout": "warn",
        "pending": "muted",
    }.get(status)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def decision_receipt(db: Session, action: PriceAction) -> DecisionReceiptView:
    """Assemble the full evidence chain for ``action`` from existing state."""
    batch = db.get(PriceBatch, action.batch_id)
    channels = queries._channels_for(action)

    # Bounded keyed lookups — no N+1 inside any loop.
    incidents = list(
        db.scalars(select(Incident).where(Incident.action_id == action.id))
    )
    incident_ids = [i.id for i in incidents]
    store_tasks: list[StoreTask] = []
    if incident_ids:
        store_tasks = list(
            db.scalars(select(StoreTask).where(StoreTask.incident_id.in_(incident_ids)))
        )
    eligibility = measurement.derive_eligibility(action, incidents, store_tasks)

    sku_link = db.scalar(select(SKUProductLink).where(SKUProductLink.sku == action.sku))
    entity = db.get(ProductEntity, sku_link.entity_id) if sku_link else None

    profile = (
        db.get(ConnectorProfile, batch.connector_profile_id)
        if batch and batch.connector_profile_id
        else None
    )

    audit_rows = _action_audit(db, action.id, incident_ids)

    # Override Memory: durable regression cases learned from this action. Lazy
    # import keeps the receipt module's import graph flat (regression -> cert ->
    # ... never imports receipt, but the lazy import is defensive).
    from app.services import regression

    regression_cases = regression.cases_for_action(db, action.id)

    stages = [
        _stage_signal(action, batch),
        _stage_match(action, sku_link, entity),
        _stage_approved(action, batch),
        _stage_certified(profile),
        _stage_published(action, channels),
        _stage_verified(channels),
        _stage_measured(eligibility),
        _stage_learned(incidents, store_tasks, audit_rows, regression_cases),
    ]

    stopped = next((s.key for s in stages if s.state == "failed"), None)
    outcome, headline = _summarize(eligibility, action)

    return DecisionReceiptView(
        action_id=action.id,
        sku=action.sku,
        product_name=action.product_name,
        store_id=action.store_id,
        zone=batch.zone if batch else "",
        batch_id=action.batch_id,
        batch_external_id=batch.external_id if batch else "",
        approved_price=action.approved_price,
        prior_price=action.prior_price,
        reason=action.reason,
        is_kvi=action.is_kvi,
        is_perishable=action.is_perishable,
        decision=action.decision.value,
        outcome=outcome,
        headline=headline,
        stopped_at_stage=stopped,
        channels=channels,
        measurement_eligibility=MeasurementEligibilityView(**eligibility.to_dict()),
        stages=stages,
        incidents=[_incident_ref(i) for i in incidents],
        audit=audit_rows,
        generated_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Audit trail (read-only)
# ---------------------------------------------------------------------------
def _action_audit(db: Session, action_id: str, incident_ids: list[str]) -> list[AuditEventView]:
    cond = AuditEvent.action_id == action_id
    if incident_ids:
        cond = or_(cond, AuditEvent.incident_id.in_(incident_ids))
    rows = list(db.scalars(select(AuditEvent).where(cond).order_by(AuditEvent.created_at)))
    return [
        AuditEventView(id=r.id, event=r.event, detail=r.detail, actor=r.actor, created_at=r.created_at)
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Stage builders — each reads existing state and returns a ReceiptStageView
# ---------------------------------------------------------------------------
def _stage_signal(action: PriceAction, batch: PriceBatch | None) -> ReceiptStageView:
    delta = action.approved_price - action.prior_price
    direction = "Markdown" if delta < 0 else ("Price increase" if delta > 0 else "Price hold")
    pct = (abs(delta) / action.prior_price * 100.0) if action.prior_price else 0.0

    ev = [
        ReceiptEvidenceItem(
            label="Movement",
            value=f"{_money(action.prior_price)} → {_money(action.approved_price)}",
            tone="verified" if delta < 0 else None,
        ),
        ReceiptEvidenceItem(label="Reason", value=action.reason),
    ]
    if action.projected_impact:
        ev.append(ReceiptEvidenceItem(label="Projected impact", value=action.projected_impact))
    flags = [f for f, on in (("KVI", action.is_kvi), ("Perishable", action.is_perishable)) if on]
    if flags:
        ev.append(ReceiptEvidenceItem(label="Flags", value=", ".join(flags), tone="warn"))

    headline = (
        f"{direction} approved upstream ({pct:.1f}%)" if delta else "Price hold approved upstream"
    )
    return ReceiptStageView(
        key="signal",
        label="Signal",
        state="verified",
        headline=headline,
        detail=(
            f"Upstream pricing approved {action.product_name} at {_money(action.approved_price)} "
            f"for Store {action.store_id}. ShelfTrace executes approved prices — it does not set them."
        ),
        evidence=ev,
        at=batch.created_at if batch else None,
    )


def _stage_match(
    action: PriceAction,
    sku_link: SKUProductLink | None,
    entity: ProductEntity | None,
) -> ReceiptStageView:
    if sku_link and entity:
        conf = entity.match_confidence or 0.0
        curated = "curator-approved" if entity.is_manual else "auto-matched"
        ev = [
            ReceiptEvidenceItem(label="Canonical entity", value=entity.canonical_title, tone="verified"),
            ReceiptEvidenceItem(label="Match", value=f"{curated} · {round(conf * 100)}% confidence"),
        ]
        if entity.brand:
            ev.append(ReceiptEvidenceItem(label="Brand", value=entity.brand))
        if entity.upc:
            ev.append(ReceiptEvidenceItem(label="UPC", value=entity.upc))
        return ReceiptStageView(
            key="match",
            label="Match",
            state="verified",
            headline="Resolved to a canonical product entity",
            detail=(
                "The SKU is linked to a cross-source product entity, so competitor and "
                "elasticity signals attribute to the same physical product."
            ),
            evidence=ev,
        )
    return ReceiptStageView(
        key="match",
        label="Match",
        state="not_applicable",
        headline="Executed by SKU — no canonical entity link",
        detail=(
            f"SKU {action.sku} has no product-graph entity link. The price still executes "
            "directly by SKU; cross-source matching is an optional, heuristic enrichment layer."
        ),
        evidence=[ReceiptEvidenceItem(label="SKU", value=action.sku, tone="muted")],
    )


def _stage_approved(action: PriceAction, batch: PriceBatch | None) -> ReceiptStageView:
    if batch is None:
        return ReceiptStageView(
            key="approved",
            label="Approved",
            state="pending",
            headline="Batch context unavailable",
            detail="The parent batch could not be loaded.",
            evidence=[],
        )
    canary = queries._canary_ids(batch)
    ev = [
        ReceiptEvidenceItem(label="Approved by", value=batch.approved_by),
        ReceiptEvidenceItem(label="Batch", value=batch.external_id),
        ReceiptEvidenceItem(label="Idempotency key", value=batch.idempotency_key, tone="muted"),
        ReceiptEvidenceItem(label="Run mode", value=f"{batch.run_mode.value} · {batch.environment.value}"),
        ReceiptEvidenceItem(label="Canary scope", value=f"{len(canary)} of {batch.total_store_count} stores"),
    ]
    return ReceiptStageView(
        key="approved",
        label="Approved",
        state="verified",
        headline="Accepted into the control plane",
        detail=(
            "The approved batch was received behind a transactional outbox with an idempotency "
            "key — re-submitting the same key is a no-op, never a double execution."
        ),
        evidence=ev,
        at=batch.created_at,
    )


def _stage_certified(profile: ConnectorProfile | None) -> ReceiptStageView:
    if profile is None:
        return ReceiptStageView(
            key="certified",
            label="Certified",
            state="not_applicable",
            headline="Sandbox connector — no certification gate",
            detail=(
                "This batch ran against the deterministic simulator, not a certified production "
                "connector. The certification lab gates real connectors before live rollout."
            ),
            evidence=[ReceiptEvidenceItem(label="Connector", value="simulator", tone="muted")],
        )
    if profile.status == ConnectorStatus.CERTIFIED:
        state, headline = "verified", "Connector certified before rollout"
    elif profile.status == ConnectorStatus.FAILED:
        state, headline = "failed", "Connector certification failed"
    else:
        state, headline = "pending", "Connector pending certification"
    return ReceiptStageView(
        key="certified",
        label="Certified",
        state=state,
        headline=headline,
        detail="The connector profile that executed this action and its certification status.",
        evidence=[
            ReceiptEvidenceItem(label="Connector", value=profile.name),
            ReceiptEvidenceItem(label="Retailer", value=profile.retailer_name),
            ReceiptEvidenceItem(label="Status", value=profile.status.value, tone=_state_tone(state)),
        ],
    )


def _stage_published(action: PriceAction, channels: list[ChannelView]) -> ReceiptStageView:
    deliveries = list(action.deliveries)
    if not deliveries:
        return ReceiptStageView(
            key="published",
            label="Published",
            state="pending",
            headline="No channel deliveries dispatched yet",
            detail="No deliveries have been created for this action.",
            evidence=[],
        )
    not_sent = [d for d in deliveries if d.status == DeliveryStatus.PENDING]
    chans = ", ".join(sorted({d.channel.value.upper() for d in deliveries}))
    ev = [
        ReceiptEvidenceItem(label="Channels", value=chans),
        ReceiptEvidenceItem(label="Total attempts", value=str(sum(d.attempts for d in deliveries))),
    ]
    if not_sent:
        return ReceiptStageView(
            key="published",
            label="Published",
            state="active",
            headline=f"Dispatching to {len(deliveries)} channels",
            detail="Some deliveries are still queued in the outbox.",
            evidence=ev,
        )
    return ReceiptStageView(
        key="published",
        label="Published",
        state="verified",
        headline=f"Dispatched to {len(deliveries)} channels via the outbox",
        detail=(
            "Every required channel update left the transactional outbox. Delivery is decoupled "
            "from the API request, so a channel outage can't lose an approved price."
        ),
        evidence=ev,
    )


def _stage_verified(channels: list[ChannelView]) -> ReceiptStageView:
    if not channels:
        return ReceiptStageView(
            key="verified",
            label="Verified",
            state="pending",
            headline="Awaiting channel receipts",
            detail="No execution receipts have been recorded yet.",
            evidence=[],
        )
    mismatch = [c for c in channels if c.status == "mismatch"]
    soft = [c for c in channels if c.status in ("timeout", "pending")]
    verified = [c for c in channels if c.status == "verified"]
    ev = [
        ReceiptEvidenceItem(
            label=c.channel.upper(),
            value=(
                f"{c.status} · observed {_money(c.observed_price)}"
                if c.observed_price is not None
                else c.status
            ),
            tone=_channel_tone(c.status),
        )
        for c in channels
    ]
    if mismatch:
        c = mismatch[0]
        return ReceiptStageView(
            key="verified",
            label="Verified",
            state="failed",
            headline=(
                f"{c.channel.upper()} reports {_money(c.observed_price)} "
                f"vs approved {_money(c.expected_price)}"
            ),
            detail=(
                "Reconciliation compared each channel's observed price to the approved price. A "
                "mismatch breaks the verified chain — the action cannot be measurement-eligible."
            ),
            evidence=ev,
        )
    if soft:
        ch = soft[0].channel.upper()
        return ReceiptStageView(
            key="verified",
            label="Verified",
            state="active",
            headline=f"{ch} has not acknowledged yet",
            detail="One or more channels have not returned a verified receipt. Reconciliation is incomplete.",
            evidence=ev,
        )
    return ReceiptStageView(
        key="verified",
        label="Verified",
        state="verified",
        headline=f"All {len(verified)} channels reconciled to the approved price",
        detail="Every required shopper-facing channel observed exactly the approved price.",
        evidence=ev,
    )


_MEASURE_STATE = {
    MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED: (
        "verified",
        "Eligible for performance measurement",
    ),
    MeasurementEligibility.INELIGIBLE_AWAITING_ACKNOWLEDGEMENT: (
        "pending",
        "Quarantined — awaiting acknowledgement",
    ),
    MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED: (
        "failed",
        "Quarantined — execution not verified",
    ),
    MeasurementEligibility.EXCLUDED_RECOVERY_INCOMPLETE: (
        "excluded",
        "Excluded — recovery in effect",
    ),
}


def _stage_measured(eligibility: EligibilityResult) -> ReceiptStageView:
    state, headline = _MEASURE_STATE.get(eligibility.status, ("pending", "Measurement pending"))
    req, ver = eligibility.required_channels, eligibility.verified_channels
    ev = [
        ReceiptEvidenceItem(label="Verdict", value=eligibility.status.value, tone=_state_tone(state)),
        ReceiptEvidenceItem(label="Reason", value=eligibility.reason),
        ReceiptEvidenceItem(
            label="Channels verified",
            value=f"{len(ver)} of {len(req)}",
            tone="verified" if req and len(ver) == len(req) else None,
        ),
    ]
    if eligibility.blocked_channel:
        ev.append(ReceiptEvidenceItem(label="Blocked channel", value=eligibility.blocked_channel.upper(), tone="danger"))
    return ReceiptStageView(
        key="measured",
        label="Measured",
        state=state,
        headline=headline,
        detail=eligibility.summary,
        evidence=ev,
    )


def _stage_learned(
    incidents: list[Incident],
    store_tasks: list[StoreTask],
    audit_rows: list[AuditEventView],
    regression_cases: list | None = None,
) -> ReceiptStageView:
    open_inc = [i for i in incidents if i.status in (IncidentStatus.OPEN, IncidentStatus.RETRYING)]
    rolled = [i for i in incidents if i.status == IncidentStatus.ROLLED_BACK]
    resolved = [i for i in incidents if i.status == IncidentStatus.RESOLVED]

    recovery_events = [a for a in audit_rows if any(h in a.event.lower() for h in _RECOVERY_HINTS)]
    ev = [ReceiptEvidenceItem(label=a.actor, value=a.event, tone="muted") for a in recovery_events[-4:]]
    open_tasks = [t for t in store_tasks if t.status == StoreTaskStatus.OPEN]
    if open_tasks:
        ev.append(ReceiptEvidenceItem(label="Open store task", value=f"{len(open_tasks)} awaiting associate", tone="warn"))

    # Override Memory: when this action's failure mode was captured as a durable
    # regression case, the Learned stage points at the real saved row instead of
    # relying on the narrative "captured in the audit trail" hint. The override
    # is provably remembered — it now guards future batches.
    regression_cases = regression_cases or []
    if regression_cases:
        case_ev = list(ev)
        for case in regression_cases[:3]:
            replayed = getattr(case, "last_replayed_at", None) is not None
            case_ev.append(
                ReceiptEvidenceItem(
                    label="Regression case" + (" · replayed" if replayed else ""),
                    value=case.title,
                    tone="verified",
                )
            )
        return ReceiptStageView(
            key="learned",
            label="Learned",
            state="verified",
            headline=f"Saved as durable protection — {len(regression_cases)} regression case"
            + ("s" if len(regression_cases) != 1 else ""),
            detail=(
                "This failure mode was captured as Override Memory: a durable regression case "
                "that re-exercises the original failure signature through the shared certification "
                "engine, so the next batch is protected rather than re-learning the same lesson."
            ),
            evidence=case_ev,
        )

    if rolled:
        return ReceiptStageView(
            key="learned",
            label="Learned",
            state="excluded",
            headline="Rolled back — approved price preserved for re-attempt",
            detail=(
                "An operator rolled the shelf label back to match checkout. The approved price is "
                "unchanged, so the next batch re-attempts the original markdown — the override is "
                "captured in the audit trail, not silently dropped."
            ),
            evidence=ev,
        )
    if open_inc:
        return ReceiptStageView(
            key="learned",
            label="Learned",
            state="active",
            headline="Recovery in progress",
            detail=(
                "An incident is open. Every retry, rollback, and store task is audited so the "
                "intervention feeds the next decision rather than disappearing."
            ),
            evidence=ev or [ReceiptEvidenceItem(label="Incident", value=open_inc[0].type.value, tone="warn")],
        )
    if resolved:
        return ReceiptStageView(
            key="learned",
            label="Learned",
            state="verified",
            headline="Recovered and resolved",
            detail="The incident was recovered and resolved; the full intervention trail is preserved as audit evidence.",
            evidence=ev,
        )
    return ReceiptStageView(
        key="learned",
        label="Learned",
        state="verified",
        headline="Clean execution — no intervention needed",
        detail="No incident was opened. The verified result is trustworthy measurement evidence with no overrides applied.",
        evidence=ev,
    )


# ---------------------------------------------------------------------------
# Compact references + top-line summary
# ---------------------------------------------------------------------------
def _incident_ref(i: Incident) -> IncidentRefView:
    return IncidentRefView(
        id=i.id,
        type=i.type.value,
        severity=i.severity.value,
        status=i.status.value,
        summary=i.summary,
        offending_channel=i.offending_channel.value if i.offending_channel else None,
        created_at=i.created_at,
        resolved_at=i.resolved_at,
    )


def _summarize(eligibility: EligibilityResult, action: PriceAction) -> tuple[str, str]:
    st = eligibility.status
    if st == MeasurementEligibility.ELIGIBLE_ALL_REQUIRED_CHANNELS_VERIFIED:
        return (
            "VERIFIED_ELIGIBLE",
            f"Verified across all required channels at {_money(action.approved_price)} — eligible for measurement.",
        )
    if st == MeasurementEligibility.INELIGIBLE_AWAITING_ACKNOWLEDGEMENT:
        ch = (eligibility.blocked_channel or "channel").upper()
        return (
            "AWAITING_ACKNOWLEDGEMENT",
            f"Awaiting {ch} acknowledgement — quarantined from measurement until reconciled.",
        )
    if st == MeasurementEligibility.INELIGIBLE_EXECUTION_NOT_VERIFIED:
        ch = (eligibility.blocked_channel or "a channel").upper()
        return ("EXECUTION_BLOCKED", f"Execution blocked at {ch} — quarantined from measurement.")
    if st == MeasurementEligibility.EXCLUDED_RECOVERY_INCOMPLETE:
        return (
            "EXCLUDED_RECOVERY",
            "Excluded from measurement — an operator rollback or recovery task is in effect.",
        )
    return ("PENDING", "Execution evidence incomplete — not yet eligible for measurement.")
