"""External signals — events that shift the demand curve.

The pricing JD specifically calls out "external variables" as inputs
to the model. This module is where they live. A signal multiplies the
expected demand for a SKU during its effective window — the optimizer
then sees the boosted demand and prices accordingly.

Examples:
  • Memorial Day weekend → demand × 1.4 on grilling SKUs
  • Heat wave alert      → demand × 1.6 on cold beverages
  • Competitor stockout  → demand × 1.25 on category staples
  • Hurricane warning    → demand × 2.0 on water, batteries, bread

All signals are stored in the `external_signals` table with an
effective window. The pricing pipeline reads active signals at run
time and applies them to the elasticity-derived demand prediction.

For the demo we seed a single Memorial Day signal on grilling items
(matches the Memorial Day Dallas Zone 2 batch theme). Production
plugs in weather APIs, news monitors, etc.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence


@dataclass
class ExternalSignal:
    """Demand multiplier active during a window for a category or SKU set."""

    name: str
    signal_type: str                   # "holiday" | "weather" | "competitor" | "event"
    multiplier: float                  # e.g. 1.4 → 40% demand boost
    effective_from: datetime
    effective_until: datetime
    category_pattern: str | None = None  # match by category prefix
    sku_pattern: str | None = None       # match by sku prefix

    def is_active(self, now: datetime | None = None) -> bool:
        now = now or datetime.now(timezone.utc)
        return self.effective_from <= now <= self.effective_until

    def applies_to(self, sku: str, category: str | None) -> bool:
        if self.sku_pattern and sku.startswith(self.sku_pattern):
            return True
        if self.category_pattern and category and category.lower().startswith(
            self.category_pattern.lower(),
        ):
            return True
        # If neither pattern is set, it's a global signal (e.g. zone-wide event)
        return self.sku_pattern is None and self.category_pattern is None


def combined_multiplier(
    signals: Sequence[ExternalSignal],
    sku: str,
    category: str | None,
    now: datetime | None = None,
) -> float:
    """Product of all active matching multipliers. 1.0 if none apply."""
    mult = 1.0
    matched: list[str] = []
    for s in signals:
        if s.is_active(now) and s.applies_to(sku, category):
            mult *= s.multiplier
            matched.append(s.name)
    return mult
