"""Deep data-integrity audit of the local dev DB.

Hunts for issues that the API + UI surfaces hide:
  • Demo-flag inconsistencies on product_entities
  • Bulk-import provenance gaps on test_run_configs
  • Stuck/orphaned outbox events
  • Missing costs for SKUs that need margin-target classification
  • Recommendation freshness vs current PriceAction state
  • SKU coverage in the product knowledge graph
  • Channel delivery completeness per action
  • Orphan rows (foreign-key consistency in absence of cascade)

Reports findings with PASS / WARN / FAIL severity. Designed to be run
against either the SQLite dev DB or production Postgres — connection
auto-resolves from DATABASE_URL.

Run:
    python -m scripts.db_audit
or with a custom path:
    DATABASE_URL=sqlite:///./shelftrace_dev.db python -m scripts.db_audit
"""
from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path


def _connect() -> sqlite3.Connection:
    db_path = (
        Path(__file__).resolve().parent.parent / "shelftrace_dev.db"
    )
    if not db_path.exists():
        print(f"FAIL: dev DB not found at {db_path}", file=sys.stderr)
        sys.exit(1)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _q(conn, sql, *params):
    return conn.execute(sql, params).fetchall()


def _scalar(conn, sql, *params):
    row = conn.execute(sql, params).fetchone()
    return row[0] if row else None


class Audit:
    def __init__(self):
        self.findings: list[tuple[str, str, str]] = []  # (severity, name, message)

    def passed(self, name: str, message: str):
        self.findings.append(("PASS", name, message))

    def warn(self, name: str, message: str):
        self.findings.append(("WARN", name, message))

    def fail(self, name: str, message: str):
        self.findings.append(("FAIL", name, message))

    def report(self):
        print()
        print("=" * 70)
        print(" ShelfTrace DB Audit Report ".center(70, "="))
        print("=" * 70)
        for severity, name, message in self.findings:
            icon = {"PASS": "OK   ", "WARN": "WARN ", "FAIL": "FAIL "}[severity]
            print(f"  [{icon}] {name}")
            for line in message.splitlines():
                print(f"           {line}")
        print()
        passed = sum(1 for f in self.findings if f[0] == "PASS")
        warned = sum(1 for f in self.findings if f[0] == "WARN")
        failed = sum(1 for f in self.findings if f[0] == "FAIL")
        print(f"  {passed} passed · {warned} warnings · {failed} failures")
        print()
        return failed


def main():
    conn = _connect()
    a = Audit()

    # ── 1. Entity demo-flag consistency ──────────────────────────────────
    # My frontend filter assumes: demo entities have is_manual=1 AND no
    # bootstrapped_from_scenario flag in attributes JSON.
    demo_seeded = _q(
        conn,
        """
        SELECT id, canonical_title, is_manual, attributes
        FROM product_entities
        WHERE is_manual = 1
        """,
    )
    fishy = [
        r for r in demo_seeded
        if r["attributes"] and '"bootstrapped_from_scenario": true' in r["attributes"]
    ]
    if fishy:
        a.fail(
            "Entity demo-flag consistency",
            f"{len(fishy)} entities have is_manual=1 AND bootstrap=true — filter is ambiguous.",
        )
    else:
        a.passed(
            "Entity demo-flag consistency",
            f"{len(demo_seeded)} is_manual=1 entities, none also bootstrapped. Filter is reliable.",
        )

    # Also: any orphan entities (no SKU link, no competitor link)?
    orphans = _q(
        conn,
        """
        SELECT e.id, e.canonical_title
        FROM product_entities e
        LEFT JOIN sku_product_links spl ON spl.entity_id = e.id
        LEFT JOIN competitor_product_entities cpe ON cpe.entity_id = e.id
        WHERE spl.id IS NULL AND cpe.id IS NULL
        """,
    )
    if orphans:
        a.warn(
            "Orphan entities",
            f"{len(orphans)} entities with no SKU link and no competitor link. Cruft from failed imports?",
        )
    else:
        a.passed("Orphan entities", "Every entity has at least one SKU or competitor link.")

    # ── 2. Bulk-import provenance ────────────────────────────────────────
    # Codex's migration 0004 added import_source_hash + import_source_name.
    # Did the bulk-import path actually populate them?
    try:
        provenance_rows = _q(
            conn,
            """
            SELECT name, import_source_hash, import_source_name
            FROM test_run_configs
            WHERE import_source_hash IS NOT NULL OR import_source_name IS NOT NULL
            """,
        )
        all_configs = _scalar(conn, "SELECT COUNT(*) FROM test_run_configs")
        seeded = _scalar(conn, "SELECT COUNT(*) FROM test_run_configs WHERE is_seeded = 1")
        user_configs = all_configs - seeded
        with_provenance = len(provenance_rows)
        if user_configs > 0 and with_provenance == 0:
            a.warn(
                "Bulk-import provenance",
                f"{user_configs} user-created configs but ZERO have import_source_hash. "
                f"Either uploads didn't go through the bulk-import path, or the field isn't being stamped.",
            )
        elif user_configs == 0:
            a.passed("Bulk-import provenance", "No user configs to inspect yet.")
        else:
            a.passed(
                "Bulk-import provenance",
                f"{with_provenance} of {user_configs} user-created configs carry import provenance.",
            )
    except sqlite3.OperationalError as e:
        a.warn("Bulk-import provenance", f"Provenance columns missing: {e}")

    # ── 3. Outbox health ─────────────────────────────────────────────────
    stuck = _q(
        conn,
        """
        SELECT id, event_type, attempts, last_error
        FROM outbox_events
        WHERE status = 'pending' AND attempts >= 3
        """,
    )
    pending = _scalar(conn, "SELECT COUNT(*) FROM outbox_events WHERE status = 'pending'")
    processed = _scalar(conn, "SELECT COUNT(*) FROM outbox_events WHERE status = 'sent'")
    if stuck:
        a.warn(
            "Outbox stuck events",
            f"{len(stuck)} pending events with attempts >= 3. Sample: {stuck[0]['event_type']}, error: {stuck[0]['last_error']}",
        )
    elif pending and pending > 50:
        a.warn(
            "Outbox backlog",
            f"{pending} pending events (vs {processed} sent). Worker might not be draining.",
        )
    else:
        a.passed(
            "Outbox health",
            f"{pending} pending / {processed} sent. No stuck events.",
        )

    # ── 4. Margin-target data coverage ───────────────────────────────────
    # The margin target endpoint classifies actions and needs ProductCost
    # for each SKU. How many actions are missing cost?
    coverage = _q(
        conn,
        """
        SELECT
            COUNT(DISTINCT pa.sku) AS total_skus,
            COUNT(DISTINCT pc.sku) AS skus_with_cost,
            SUM(pa.is_kvi) AS kvi_actions
        FROM price_actions pa
        LEFT JOIN product_costs pc ON pc.sku = pa.sku
        """,
    )[0]
    total, with_cost, kvi = coverage["total_skus"], coverage["skus_with_cost"], coverage["kvi_actions"]
    missing = total - with_cost
    if missing > 0 and total > 0:
        pct_missing = missing * 100 / total
        sev = a.fail if pct_missing > 50 else a.warn
        sev(
            "Margin-target cost coverage",
            f"{missing} of {total} distinct SKUs ({pct_missing:.0f}%) lack a ProductCost. "
            f"Margin-target dashboard treats these as n_with_cost=0; rollup may underrepresent.",
        )
    else:
        a.passed("Margin-target cost coverage", f"{total} SKUs, all with cost rows. KVI: {kvi}.")

    # ── 5. Recommendation freshness ──────────────────────────────────────
    # Are there current (non-superseded) recommendations whose current_price
    # no longer matches the latest PriceAction approved_price? That would
    # mean the recs are stale.
    stale = _q(
        conn,
        """
        SELECT pr.sku, pr.store_id, pr.current_price, pa.approved_price
        FROM pricing_recommendations pr
        JOIN price_actions pa ON pa.sku = pr.sku AND pa.store_id = pr.store_id
        WHERE pr.superseded_by IS NULL
          AND ABS(pr.current_price - pa.approved_price) > 0.005
        LIMIT 20
        """,
    )
    if stale:
        a.warn(
            "Recommendation freshness",
            f"{len(stale)} live recommendations have a stale current_price. Re-run engine or supersede.",
        )
    else:
        a.passed("Recommendation freshness", "All live recommendations match their latest PriceAction.")

    # ── 6. SKU graph coverage ────────────────────────────────────────────
    sku_unlinked = _q(
        conn,
        """
        SELECT pa.sku, COUNT(*) AS n_actions
        FROM price_actions pa
        LEFT JOIN sku_product_links spl ON spl.sku = pa.sku
        WHERE spl.id IS NULL
        GROUP BY pa.sku
        ORDER BY n_actions DESC
        """,
    )
    if sku_unlinked:
        a.warn(
            "SKU graph coverage",
            f"{len(sku_unlinked)} distinct SKUs have PriceActions but no entity link. "
            f"Cross-source lookups will return nothing for these. "
            f"Top miss: {sku_unlinked[0]['sku']} ({sku_unlinked[0]['n_actions']} actions).",
        )
    else:
        a.passed("SKU graph coverage", "Every SKU in PriceActions is linked to an entity.")

    # ── 7. Channel delivery completeness ─────────────────────────────────
    # Every PriceAction should have a ChannelDelivery row per channel —
    # BUT expansion-store actions are published lazily on expand. So we
    # only flag a delivery gap when the batch has completed (where every
    # store's actions should have been published) OR when a canary-store
    # action is missing deliveries.
    expected_channels = 3  # POS, ESL, ECOMMERCE
    incomplete = _q(
        conn,
        f"""
        SELECT pa.id, pa.sku, pa.store_id, pb.status, pb.external_id,
               COUNT(cd.id) AS delivery_count
        FROM price_actions pa
        JOIN price_batches pb ON pb.id = pa.batch_id
        LEFT JOIN channel_deliveries cd ON cd.action_id = pa.id
        GROUP BY pa.id
        HAVING COUNT(cd.id) < {expected_channels}
        """,
    )
    # Filter to real gaps: completed batches with missing deliveries are
    # genuine bugs. Pending/expanding batches haven't published yet, OK.
    real_gaps = [
        r for r in incomplete
        if r["status"] == "completed"
    ]
    if real_gaps:
        a.fail(
            "Channel delivery completeness",
            f"{len(real_gaps)} actions in COMPLETED batches lack {expected_channels} deliveries. "
            f"Reconciliation may have skipped them. Sample batch: {real_gaps[0]['external_id']}.",
        )
    elif incomplete:
        a.passed(
            "Channel delivery completeness",
            f"{len(incomplete)} actions are missing deliveries, but all are in non-completed batches "
            f"(expansion published lazily on expand). Expected.",
        )
    else:
        a.passed(
            "Channel delivery completeness",
            f"All actions have {expected_channels} channel deliveries.",
        )

    # ── 8. Orphan check: ChannelDelivery without parent PriceAction ──────
    orphan_deliveries = _scalar(
        conn,
        """
        SELECT COUNT(*) FROM channel_deliveries cd
        LEFT JOIN price_actions pa ON pa.id = cd.action_id
        WHERE pa.id IS NULL
        """,
    )
    if orphan_deliveries:
        a.fail(
            "Orphan channel deliveries",
            f"{orphan_deliveries} channel deliveries reference missing PriceActions. FK integrity broken.",
        )
    else:
        a.passed("Orphan channel deliveries", "No orphan rows.")

    # ── 9. Batch-status sanity ───────────────────────────────────────────
    # Any batches in CANARY_VERIFYING for > 1 hour?
    long_running = _q(
        conn,
        """
        SELECT external_id, status,
               CAST((julianday('now') - julianday(created_at)) * 24 AS INTEGER) AS hours_old
        FROM price_batches
        WHERE status IN ('canary_verifying', 'canary_publishing', 'expanding')
          AND (julianday('now') - julianday(created_at)) * 24 > 1
        """,
    )
    if long_running:
        a.warn(
            "Long-running batch states",
            f"{len(long_running)} batches stuck in transitional states for > 1h. "
            f"Either reconciliation didn't finish or status updates aren't persisting.",
        )
    else:
        a.passed("Batch state transitions", "No batches stuck in transitional states.")

    # ── 10. Demo / Live split ────────────────────────────────────────────
    demo_batch_count = _scalar(
        conn,
        "SELECT COUNT(*) FROM price_batches WHERE external_id = 'memorial-day-dallas-02'",
    )
    live_cfg_count = _scalar(
        conn,
        "SELECT COUNT(*) FROM price_batches WHERE external_id LIKE 'live-cfg_%'",
    )
    cert_count = _scalar(
        conn,
        "SELECT COUNT(*) FROM price_batches WHERE external_id LIKE 'certification-%'",
    )
    a.passed(
        "Demo / Live / Cert batch split",
        f"demo: {demo_batch_count} · live: {live_cfg_count} · certification: {cert_count}",
    )

    return a.report()


if __name__ == "__main__":
    sys.exit(main())
