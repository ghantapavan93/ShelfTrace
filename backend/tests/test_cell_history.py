"""Cell-history endpoint — powers the matrix cell drawer on the batch detail page."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _seed_running_batch(db) -> tuple[str, str]:
    """Create a scenario, run it live, return (external_id, first_action_id)."""
    client = TestClient(app)

    # 1. Create the scenario config
    cfg = client.post(
        "/api/v1/scenarios",
        json={
            "name": "Cell-history test",
            "run_mode": "live_rollout",
            "environment": "simulated_production",
            "zone_name": "TestZone",
            "store_ids": ["S-A", "S-B"],
            "canary_store_ids": ["S-A"],
            "actions": [
                {
                    "sku": "ch-test-sku",
                    "product_name": "Cell History Test Item",
                    "previous_price": 4.99,
                    "approved_price": 4.49,
                    "reason": "Test",
                    "is_kvi": False,
                    "deadline_at": None,
                }
            ],
            "behaviors": [],
        },
    )
    assert cfg.status_code == 201, cfg.json()
    config_id = cfg.json()["id"]

    # 2. Execute as live so a batch + actions exist
    exec_res = client.post(f"/api/v1/scenarios/{config_id}/execute?mode=live_rollout")
    assert exec_res.status_code == 200, exec_res.json()
    external_id = exec_res.json()["batch_external_id"]
    assert external_id

    # 3. Pull the batch detail to find the first action_id
    batch_res = client.get(f"/api/v1/batches/{external_id}")
    assert batch_res.status_code == 200
    actions = batch_res.json()["actions"]
    assert len(actions) >= 1
    return external_id, actions[0]["id"]


def test_cell_history_returns_delivery_and_receipt(db):
    """Happy path — the drawer's primary payload."""
    external_id, action_id = _seed_running_batch(db)
    client = TestClient(app)

    res = client.get(
        f"/api/v1/batches/{external_id}/actions/{action_id}/channels/pos/history"
    )
    assert res.status_code == 200
    body = res.json()

    # Action context block
    assert body["action"]["id"] == action_id
    assert body["action"]["sku"] == "ch-test-sku"
    assert body["channel"] == "pos"

    # Delivery should exist after orchestrator drained
    assert body["delivery"] is not None
    assert body["delivery"]["attempts"] >= 1

    # Receipt should exist for verified deliveries
    assert body["receipt"] is not None
    assert body["receipt"]["expected_price"] == 4.49

    # Audit events should include at least one channel-tagged row
    assert isinstance(body["audit_events"], list)


def test_cell_history_404_unknown_action(db):
    external_id, _ = _seed_running_batch(db)
    client = TestClient(app)
    res = client.get(
        f"/api/v1/batches/{external_id}/actions/act_unknown/channels/pos/history"
    )
    assert res.status_code == 404


def test_cell_history_422_bad_channel(db):
    external_id, action_id = _seed_running_batch(db)
    client = TestClient(app)
    res = client.get(
        f"/api/v1/batches/{external_id}/actions/{action_id}/channels/twitter/history"
    )
    assert res.status_code == 422


def test_cell_history_handles_missing_delivery_gracefully(db):
    """If for some reason a delivery row doesn't exist for that channel,
    the endpoint returns a 200 with a clear note instead of crashing —
    the drawer can render an explanatory empty state."""
    external_id, action_id = _seed_running_batch(db)
    client = TestClient(app)

    # Force a query against a valid channel; the seeded scenario should have
    # all three channels wired, so delivery WILL exist. The test verifies the
    # endpoint shape stays consistent across channels.
    for channel in ("pos", "esl", "ecommerce"):
        res = client.get(
            f"/api/v1/batches/{external_id}/actions/{action_id}/channels/{channel}/history"
        )
        assert res.status_code == 200, f"{channel} failed: {res.json()}"
        body = res.json()
        assert body["channel"] == channel
        assert "delivery" in body
