"""Prove a CUSTOM (non-egg) scenario produces a real mismatch incident through
the same engine — created from configured behavior, not hardcoded logic.

    BASE=http://localhost:8000 python -m tests.prove_custom_scenario
"""
import os
import sys

import httpx

BASE = os.environ.get("BASE", "http://localhost:8000")


def main() -> int:
    c = httpx.Client(timeout=30)

    print("=== Create a custom Whole Milk scenario (POS stale price) ===")
    payload = {
        "name": "Whole Milk Promo (custom proof)",
        "run_mode": "live_rollout",
        "environment": "simulated_production",
        "zone_name": "Test Zone",
        "store_ids": ["s1", "s2"],
        "canary_store_ids": ["s1", "s2"],
        "actions": [{
            "product_name": "Whole Milk, 1 Gallon", "sku": "milk-1gal",
            "previous_price": 3.49, "approved_price": 2.99, "reason": "Promotional price",
        }],
        "behaviors": [{
            "store_id": "s1", "sku": "milk-1gal", "channel_type": "pos",
            "behavior_type": "stale_price", "configured_observed_price": 3.49, "retry_success_price": 2.99,
        }],
    }
    created = c.post(f"{BASE}/api/v1/scenarios", json=payload).json()
    print("scenario_id =", created["id"])

    print("\n=== Execute as live rollout ===")
    res = c.post(f"{BASE}/api/v1/scenarios/{created['id']}/execute?mode=live_rollout").json()
    ext = res["batch_external_id"]
    print("redirect =", res["redirect"], "batch =", ext)

    batch = c.get(f"{BASE}/api/v1/batches/{ext}").json()
    print("batch.status =", batch["status"], "expansion_blocked =", batch["expansion_blocked"])
    milk = next(a for a in batch["actions"] if a["sku"] == "milk-1gal" and a["store_id"] == "s1")
    pos = next(ch for ch in milk["channels"] if ch["channel"] == "pos")
    print("milk @ s1 decision =", milk["decision"], "| POS:", pos["status"], "observed", pos["observed_price"])

    assert batch["status"] == "blocked"
    assert pos["status"] == "mismatch" and pos["observed_price"] == 3.49

    print("\n=== Engineering trace confirms incident came from configured behavior ===")
    eng = c.get(f"{BASE}/api/v1/engineering?external_id={ext}").json()
    print("scenario_config_id =", eng["scenario_config_id"])
    print("incident_from_configured_behavior =", eng["incident_from_configured_behavior"])
    print("behavior_profiles =", eng["behavior_profiles"])
    assert eng["incident_from_configured_behavior"] is True

    print("\n=== Restore live demo default (Memorial Day blocked) ===")
    c.post(f"{BASE}/api/v1/demo/reset")

    print("\nCUSTOM SCENARIO PROVEN OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
