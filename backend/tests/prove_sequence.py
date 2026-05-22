"""Prove the full rollout state sequence against a LIVE backend over HTTP.

    python -m tests.prove_sequence            # hits http://localhost:8000
    BASE=http://localhost:8000 python -m tests.prove_sequence

Sequence: reset -> retry egg -> retry strawberries -> expand.
"""
import os
import sys

import httpx

BASE = os.environ.get("BASE", "http://localhost:8000")
BATCH = "memorial-day-dallas-02"


def line(title: str) -> None:
    print(f"\n=== {title} ===")


def batch_state(c: httpx.Client) -> dict:
    return c.get(f"{BASE}/api/v1/batches/{BATCH}").json()


def action_decisions(detail: dict) -> dict:
    out: dict[str, str] = {}
    for a in detail["actions"]:
        key = f"{a['product_name'].split(',')[0]} @ {a['store_id']}"
        out[key] = a["decision"]
    return out


def main() -> int:
    c = httpx.Client(timeout=30)

    line("A. Demo reset")
    c.post(f"{BASE}/api/v1/demo/reset")
    b = batch_state(c)
    print("batch.status        =", b["status"])
    print("expansion_blocked   =", b["expansion_blocked"])
    print("critical_incidents  =", b["critical_incidents"], "deadline_risks =", b["deadline_risks"])
    print("canary decisions    =", action_decisions(b))
    assert b["status"] == "blocked" and b["expansion_blocked"] is True

    incidents = c.get(f"{BASE}/api/v1/incidents").json()
    egg = next(i for i in incidents if i["type"] == "price_mismatch")
    straws = [i for i in incidents if i["type"] == "deadline_risk"]

    line("B. Retry egg POS")
    c.post(f"{BASE}/api/v1/incidents/{egg['id']}/retry")
    b = batch_state(c)
    print("batch.status        =", b["status"], "(expected partially_blocked)")
    print("expansion_blocked   =", b["expansion_blocked"], "(expected True)")
    print("canary decisions    =", action_decisions(b))
    assert b["status"] == "partially_blocked" and b["expansion_blocked"] is True

    line("C. Retry strawberry ESL (both canary stores)")
    for s in straws:
        c.post(f"{BASE}/api/v1/incidents/{s['id']}/retry")
    b = batch_state(c)
    print("batch.status        =", b["status"], "(expected ready_for_expansion)")
    print("expansion_blocked   =", b["expansion_blocked"], "(expected False)")
    print("canary decisions    =", action_decisions(b))
    assert b["status"] == "ready_for_expansion" and b["expansion_blocked"] is False

    line("D. Expand to remaining stores")
    c.post(f"{BASE}/api/v1/batches/{BATCH}/expand")
    b = batch_state(c)
    print("batch.status        =", b["status"], "(expected completed)")
    print("expansion_blocked   =", b["expansion_blocked"], "(expected False)")
    print("all decisions       =", action_decisions(b))
    assert b["status"] == "completed" and b["expansion_blocked"] is False

    print("\nSEQUENCE PROVEN OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
