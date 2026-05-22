"""Prove the Certification Lab over the LIVE HTTP API, including that it runs on
the SAME shared engine as live rollout.

    BASE=http://localhost:8000 python -m tests.prove_certification
"""
import os
import sys

import httpx

BASE = os.environ.get("BASE", "http://localhost:8000")


def main() -> int:
    c = httpx.Client(timeout=30)

    print("=== Reset certification demo ===")
    report = c.post(f"{BASE}/api/v1/certification/demo/reset").json()
    by_type = {chk["check_type"]: chk for chk in report["checks"]}
    print("overall status        =", report["status"])
    print("recommendation        =", (report["final_recommendation"] or "")[:70], "...")
    print("price_agreement       =", by_type["price_agreement"]["status"],
          "(observed", by_type["price_agreement"]["evidence"].get("observed_price"), ")")
    print("markdown_sla          =", by_type["markdown_sla"]["status"])
    print("ecommerce_verification=", by_type["ecommerce_verification"]["status"])
    print("idempotent_batch      =", by_type["idempotent_batch"]["status"])
    print("recovery_safety       =", by_type["recovery_safety"]["status"])
    print("canary_protection     =", by_type["canary_protection"]["status"])
    assert report["status"] == "failed_pending_remediation"
    assert by_type["price_agreement"]["status"] == "failed"
    assert by_type["markdown_sla"]["status"] == "recovered"
    assert by_type["ecommerce_verification"]["status"] == "passed"

    print("\n=== Shared engine proof (engineering trace for certification run) ===")
    eng = c.get(f"{BASE}/api/v1/engineering?run_mode=certification").json()
    print("run_mode              =", eng["run_mode"], "/ environment", eng["environment"])
    print("outbox events         =", len(eng["outbox_events"]), "(same transactional outbox as live)")
    assert eng["run_mode"] == "certification"
    assert len(eng["outbox_events"]) > 0  # went through the shared ingestion+outbox pipeline

    print("\n=== Rerun failed checks (operator remediation) ===")
    fixed = c.post(f"{BASE}/api/v1/certification/runs/{report['run_id']}/rerun-failed-checks").json()
    print("overall status        =", fixed["status"])
    assert fixed["status"] == "passed"

    print("\n=== Restore default failed state for the demo ===")
    c.post(f"{BASE}/api/v1/certification/demo/reset")

    print("\nCERTIFICATION PROVEN OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
