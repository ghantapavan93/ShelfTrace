from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import PricingRecommendation, TestRunConfig


def test_apply_recommendation_records_approval_provenance(db):
    rec = PricingRecommendation(
        id="prec_apply_governed",
        sku="milk-1gal",
        store_id="s1",
        product_name="Whole Milk",
        current_price=5.99,
        recommended_price=5.49,
        expected_units_lift_pct=3.2,
        expected_revenue_lift=120.0,
        expected_profit_lift=54.0,
        confidence=0.81,
        elasticity_beta=-1.4,
        reasons_json={
            "reasons": [{"code": "ELASTIC_OPTIMIZED", "message": "fit"}],
            "constraints": ["shock_cap"],
        },
    )
    db.add(rec)
    db.commit()

    client = TestClient(app)
    response = client.post(
        f"/api/v1/pricing/recommendations/{rec.id}/apply",
        json={
            "approved_by": "Pricing Director",
            "approval_policy": "human_review",
            "approval_note": "Approved for store-level canary.",
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["approval"]["approved_by"] == "Pricing Director"
    assert body["approval"]["approval_policy"] == "human_review"
    assert len(body["approval"]["source_hash"]) == 64

    db.expire_all()
    cfg = db.get(TestRunConfig, body["scenario_config_id"])
    assert cfg is not None
    assert cfg.import_source_name == f"pricing_recommendation:{rec.id}"
    assert cfg.import_source_hash == body["approval"]["source_hash"]
    assert cfg.import_summary_json["approval_note"] == "Approved for store-level canary."
    assert cfg.import_summary_json["pricing_snapshot"]["recommended_price"] == 5.49
    assert cfg.created_by == "operator"

    applied = db.get(PricingRecommendation, rec.id)
    assert applied.applied is True
    assert applied.applied_to_scenario_id == cfg.id
