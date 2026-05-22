"""Generic connector-behavior resolution.

Adapter output is driven entirely by ``connector_behavior_profiles`` rows tied
to the batch's scenario configuration — there is no product-specific branching.
A missing profile defaults to a clean, successful update.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BehaviorType, Channel, ConnectorBehaviorProfile

# Marker for a channel that never acknowledges.
TIMEOUT = "__timeout__"


def resolve_profile(
    db: Session, scenario_config_id: str | None, sku: str, store_id: str, channel: str
) -> ConnectorBehaviorProfile | None:
    if not scenario_config_id:
        return None
    return db.scalar(
        select(ConnectorBehaviorProfile).where(
            ConnectorBehaviorProfile.test_run_config_id == scenario_config_id,
            ConnectorBehaviorProfile.sku == sku,
            ConnectorBehaviorProfile.store_id == store_id,
            ConnectorBehaviorProfile.channel_type == Channel(channel),
        )
    )


def observe(profile: ConnectorBehaviorProfile | None, approved_price: float, attempt: int):
    """Return the price a channel reports, or TIMEOUT, for the given attempt.

    No profile -> clean success (returns the approved price).
    """
    if profile is None:
        return approved_price

    bt = profile.behavior_type
    if bt == BehaviorType.SUCCESS:
        return approved_price
    if bt == BehaviorType.TIMEOUT:
        return TIMEOUT
    if bt == BehaviorType.TIMEOUT_THEN_SUCCESS:
        if attempt < 2:
            return TIMEOUT
        return profile.retry_success_price if profile.retry_success_price is not None else approved_price
    if bt == BehaviorType.STALE_PRICE:
        stale = profile.configured_observed_price if profile.configured_observed_price is not None else approved_price
        if attempt < 2:
            return stale
        # Heals on retry only if a recovery price is configured; otherwise stays stale.
        return profile.retry_success_price if profile.retry_success_price is not None else stale
    if bt == BehaviorType.DUPLICATE_ACK:
        # Channel confirms the approved price but emits a duplicate ack; the unique
        # (action, channel) delivery constraint makes the duplicate a no-op.
        return approved_price
    return approved_price


def is_duplicate_ack(profile: ConnectorBehaviorProfile | None) -> bool:
    return profile is not None and profile.behavior_type == BehaviorType.DUPLICATE_ACK
