"""Synthetic 90-day sales history + cost catalog for the demo SKUs.

In production this table is filled by nightly POS exports. For the
demo we generate realistic data with deliberate elasticity patterns
so the engine produces meaningful, varied recommendations:

  • milk        — moderately elastic (β ≈ -1.2)
  • eggs        — relatively inelastic (β ≈ -0.6) — staple
  • strawberry  — highly elastic (β ≈ -2.1) — perishable
  • orange-juice — branded, moderately elastic (β ≈ -1.4)

A small amount of weekly seasonality (weekend +15% demand) and a few
random promotional days are mixed in. Promotional days are flagged so
the elasticity estimator can exclude them.
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import HistoricalSale, ProductCost

# SKU profiles for the demo Memorial Day batch
PROFILES: list[dict] = [
    {
        "sku": "milk-organic-1gal",
        "base_price": 5.99,
        "base_quantity": 80,
        "beta": -1.2,
        "cost": 2.50,
        "price_levels": [5.49, 5.79, 5.99, 6.19, 6.49],
    },
    {
        "sku": "egg-cage-free-brown-12",
        "base_price": 4.19,
        "base_quantity": 150,
        "beta": -0.6,
        "cost": 1.80,
        "price_levels": [3.99, 4.09, 4.19, 4.29, 4.39],
    },
    {
        "sku": "strawberry-1lb",
        "base_price": 4.99,
        "base_quantity": 60,
        "beta": -2.1,
        "cost": 1.50,
        "price_levels": [2.99, 3.99, 4.49, 4.99, 5.49],
    },
    {
        "sku": "oj-nfc-premium-52oz",
        "base_price": 6.49,
        "base_quantity": 45,
        "beta": -1.4,
        "cost": 2.80,
        "price_levels": [5.99, 6.29, 6.49, 6.79, 6.99],
    },
]

STORE_IDS = ["214", "302", "317", "401"]
DAYS = 90


def _det_rng(seed: int):
    state = [seed]

    def next_value():
        state[0] = (state[0] * 1103515245 + 12345) % (2**31)
        return state[0] / (2**31)

    return next_value


def seed_history(db: Session) -> int:
    """Idempotent — only seeds if the table is empty. Returns rows inserted."""
    existing = db.scalar(select(HistoricalSale).limit(1))
    if existing:
        return 0

    inserted = 0
    end = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    for profile in PROFILES:
        rng = _det_rng(hash(profile["sku"]) & 0xFFFFFFFF)
        # A = base_quantity / base_price^β
        A = profile["base_quantity"] / (profile["base_price"] ** profile["beta"])
        for store in STORE_IDS:
            for d in range(DAYS):
                day = end - timedelta(days=DAYS - d)
                # Pick a price for this day — rotate through levels, occasional promo
                level_idx = (d + hash(store) % 5) % len(profile["price_levels"])
                price = profile["price_levels"][level_idx]
                # 5% of days are promotional — heavy discount + boosted demand
                is_promo = rng() < 0.05
                effective_price = price * 0.7 if is_promo else price
                # Expected demand at that price
                q_expected = A * (effective_price ** profile["beta"])
                # Weekly seasonality — weekends +15%
                if day.weekday() >= 5:
                    q_expected *= 1.15
                # Promo bump beyond the price effect
                if is_promo:
                    q_expected *= 1.8
                # Noise: log-normal with σ=0.1
                noise = math.exp((rng() - 0.5) * 0.2)
                q = max(1, int(q_expected * noise))

                db.add(
                    HistoricalSale(
                        id=f"hs_{uuid.uuid4().hex[:12]}",
                        sku=profile["sku"],
                        store_id=store,
                        date=day,
                        price=round(effective_price, 2),
                        units_sold=q,
                        on_promotion=is_promo,
                    ),
                )
                inserted += 1

        # Cost catalog
        db.add(
            ProductCost(
                id=f"cost_{uuid.uuid4().hex[:12]}",
                sku=profile["sku"],
                cost=profile["cost"],
            ),
        )
    db.commit()
    return inserted
