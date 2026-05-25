"""Psychological pricing ladder + per-category margin overrides.

Real grocery prices land on .99, .49, .79 — not on $4.7384. The
optimizer's raw output gets snapped to the nearest valid rung on the
ladder. This is a hard requirement in retail: a "$4.73" price tag
shows the shopper your engine isn't humanizing its output, and most
chains have pricing policies that REQUIRE specific endings.

We also support per-category margin floor overrides — KVI items
might run on a 2% floor, luxury items on 30%. Falls back to the
global MIN_MARGIN_PCT when no category override is set.
"""
from __future__ import annotations

# Common US grocery price endings, in priority order.
# When snapping, we pick the closest ending — these are the typical
# "preferred" ones a chain might encode in policy.
PRICE_ENDINGS = [0.99, 0.49, 0.79, 0.29, 0.95, 0.00]

# Category → margin floor as a fraction (0.05 = 5%).
# Examples loosely modeled on real grocer policies — adjustable per chain.
CATEGORY_MARGIN_FLOORS: dict[str, float] = {
    "kvi": 0.02,            # Key Value Items run tighter to beat competitors
    "perishable": 0.08,     # Perishables need higher margin to cover spoilage
    "private-label": 0.18,  # House brands subsidize KVI pricing
    "luxury": 0.30,         # Premium / specialty
}


def snap_to_ladder(price: float, allow_dollar: bool = False) -> float:
    """Snap to the nearest ending in PRICE_ENDINGS. e.g. 4.7384 → 4.79.

    For very small prices (< $1) we don't snap — a $0.79 price snapping
    to $0.99 would be a 25% jump that the optimizer didn't intend.

    `allow_dollar` lets callers permit whole-dollar endings ($5.00) for
    larger items (alcohol, frozen). Default False to bias toward .99.
    """
    if price < 1.0:
        return round(price, 2)
    dollars = int(price)
    best = price
    best_distance = float("inf")
    for ending in PRICE_ENDINGS:
        if ending == 0.00 and not allow_dollar:
            continue
        for d in (dollars - 1, dollars, dollars + 1):
            if d < 0:
                continue
            candidate = d + ending
            if candidate <= 0:
                continue
            distance = abs(candidate - price)
            if distance < best_distance:
                best_distance = distance
                best = candidate
    return round(best, 2)


def margin_floor_for(category: str | None, default: float) -> float:
    """Return the margin-floor fraction for this category, or `default`."""
    if category is None:
        return default
    key = category.strip().lower()
    return CATEGORY_MARGIN_FLOORS.get(key, default)
