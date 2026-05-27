"""One-shot backfill: seed ProductCost for every PriceAction SKU missing one.

Background — the bulk-import path used to add TestRunActions without
seeding ProductCost. The margin-target dashboard treats SKUs without
cost as excluded from the rollup, so historical uploads showed a
misleadingly partial picture. The forward fix lives in
`services/scenarios.py::_ensure_cost_for_action`; this script closes the
gap for batches that landed before that fix.

Cost defaults to 0.60 × the most recent approved_price (40% gross margin
baseline) — matches the new auto-seed logic.

Idempotent — running twice is a no-op for any SKU that already has a
cost row.

Usage:
    python -m scripts.backfill_costs              # against local dev DB
    DATABASE_URL=postgresql://... python -m scripts.backfill_costs
"""
from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

DEFAULT_COST_RATIO = 0.60


def _connect() -> sqlite3.Connection:
    db_path = Path(__file__).resolve().parent.parent / "shelftrace_dev.db"
    if not db_path.exists():
        print(f"FAIL: dev DB not found at {db_path}", file=sys.stderr)
        sys.exit(1)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def main() -> int:
    conn = _connect()
    c = conn.cursor()

    rows = c.execute(
        """
        SELECT pa.sku, MAX(pa.approved_price) AS latest_price
        FROM price_actions pa
        LEFT JOIN product_costs pc ON pc.sku = pa.sku
        WHERE pc.sku IS NULL
          AND pa.approved_price > 0
        GROUP BY pa.sku
        """
    ).fetchall()

    if not rows:
        print("Nothing to backfill — every PriceAction SKU already has a cost.")
        return 0

    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for r in rows:
        cost = round(r["latest_price"] * DEFAULT_COST_RATIO, 2)
        c.execute(
            "INSERT INTO product_costs (id, sku, cost, effective_from) VALUES (?, ?, ?, ?)",
            (f"cost_{uuid4().hex[:12]}", r["sku"], cost, now),
        )
        inserted += 1
        print(f"  + {r['sku'][:45]:45}  approved ${r['latest_price']:.2f} -> cost ${cost:.2f}")

    conn.commit()
    print(f"\nBackfilled {inserted} ProductCost rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
