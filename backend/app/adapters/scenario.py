"""Deterministic demo scenario for the mock channel adapters.

Adapters consult this map to decide what a channel "observes" for a given
(sku, store, channel) on a given attempt. The default behaviour is success:
the observed price equals the approved price. Only the scripted failures below
diverge — and they self-heal on retry so the recovery flow is demonstrable.

This is the *only* place the demo's failures are defined; the reconciliation
engine has no special-casing.
"""
from __future__ import annotations

# Canonical demo SKUs (must match the seed).
EGGS = "egg-cage-free-brown-12"
STRAWBERRIES = "strawberry-1lb"
ORANGE_JUICE = "oj-nfc-premium-52oz"

CANARY_STORE_A = "214"
CANARY_STORE_B = "302"

# Marker for a non-acknowledging channel.
TIMEOUT = "__timeout__"


def observe(sku: str, store_id: str, channel: str, approved_price: float, attempt: int) -> float | str:
    """Return the price a channel reports, or TIMEOUT if it never acknowledges.

    attempt is 1-based. Failures heal on attempt >= 2 to model a successful retry.
    """
    # Eggs at canary store 214: POS checkout never updated — still charges the
    # prior price. A retry pushes the update through.
    if sku == EGGS and store_id == CANARY_STORE_A and channel == "pos":
        if attempt < 2:
            return 4.49  # stale prior price still at the register
        return approved_price

    # Strawberry markdown: the ESL shelf label times out (no ack) at canary
    # store 214. Retrying the label update succeeds. (Store 302 updates cleanly,
    # keeping the demo to a single deadline-risk incident.)
    if sku == STRAWBERRIES and channel == "esl" and store_id == CANARY_STORE_A:
        if attempt < 2:
            return TIMEOUT
        return approved_price

    # Everything else: clean update.
    return approved_price
