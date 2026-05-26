"""What-if endpoint — single-shot input fetch for the interactive simulator."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _seed_action_and_history(db):
    """Seed a scenario, run it, then return (sku, store_id) we can what-if against."""
    client = TestClient(app)
    payload = {
        "actions": [
            {"sku": "whatif-test", "product_name": "What-If Item", "approved_price": 5.99},
        ],
        "store_ids": ["Store-A"],
        "zone_id": "Test Zone",
    }
    res = client.post("/api/v1/scenarios/auto-enrich", json=payload)
    assert res.status_code == 201
    # Create a TestRunConfig + execute as live so a PriceAction exists
    cfg = client.post(
        "/api/v1/scenarios",
        json={
            "name": "What-if scenario",
            "run_mode": "live_rollout",
            "environment": "simulated_production",
            "zone_name": "Test Zone",
            "store_ids": ["Store-A"],
            "canary_store_ids": ["Store-A"],
            "actions": [
                {
                    "sku": "whatif-test",
                    "product_name": "What-If Item",
                    "previous_price": 5.49,
                    "approved_price": 5.99,
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
    exec_res = client.post(f"/api/v1/scenarios/{config_id}/execute?mode=live_rollout")
    assert exec_res.status_code == 200, exec_res.json()
    return "whatif-test", "Store-A"


def test_what_if_returns_fit_and_context(db):
    """Endpoint returns elasticity fit + cost + observed range so the client
    can drive a slider without further API calls."""
    sku, store_id = _seed_action_and_history(db)

    client = TestClient(app)
    res = client.get(f"/api/v1/pricing/sku/{sku}/what-if-fit?store_id={store_id}")
    assert res.status_code == 200
    body = res.json()

    # Core identifiers
    assert body["sku"] == sku
    assert body["store_id"] == store_id
    assert body["product_name"] == "What-If Item"
    assert body["current_price"] == 5.99
    assert body["cost"] is not None  # auto-enrich seeded a cost
    assert body["cost"] < body["current_price"]

    # Elasticity fit block
    assert "elasticity" in body
    elast = body["elasticity"]
    assert "beta" in elast
    assert "intercept" in elast
    assert "n_observations" in elast
    assert elast["n_observations"] >= 5  # auto-enrich seeded 30 days

    # Observed price range
    assert "observed_price_range" in body
    rng = body["observed_price_range"]
    assert rng["min"] <= rng["mean"] <= rng["max"]


def test_what_if_404_for_unknown_sku(db):
    client = TestClient(app)
    res = client.get("/api/v1/pricing/sku/nonexistent/what-if-fit?store_id=Store-A")
    assert res.status_code == 404


def test_what_if_requires_store_id(db):
    """store_id is required so the simulator targets one specific store."""
    client = TestClient(app)
    res = client.get("/api/v1/pricing/sku/whatif-test/what-if-fit")
    assert res.status_code == 422  # FastAPI validation rejects missing query param
