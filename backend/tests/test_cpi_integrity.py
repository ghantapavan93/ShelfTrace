"""CPI integrity — is each competitor-index input built on the price that rang?

A competitor price index (CPI) compares the retailer's own approved "My Price"
to competitor observations for the same canonical entity. The approved price is
the *intended* price, not necessarily the one a channel verified on-shelf — if
POS still rings the prior price, the index misstates competitive position.
``app.services.product_graph.compute_cpi_integrity`` flags, per index input,
whether the approved price the index assumes is execution-verified.

Reuses the seeded Memorial Day world (``seed_live_demo``). Against that seed:
  * ``egg-cage-free-brown-12`` has a POS mismatch at store 214 → the entity-level
    CPI input is ``mismatch`` and surfaces the observed (ringing) price.
  * ``oj-nfc-premium-52oz`` @ 302 is fully verified (ELIGIBLE) → maps to
    ``verified`` at the unit level.

Competitor observations are NOT part of the base seed (they're scraped, not
executed), so each test attaches its own entity + SKU link + one competitor
observation — those are exactly the rows a CPI is computed from.
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import (
    CompetitorPriceObservation,
    CompetitorProduct,
    PriceAction,
)
from app.services import measurement
from app.services import product_graph as pg
from app.services.product_graph import (
    CPI_MISMATCH,
    CPI_UNVERIFIED,
    CPI_VERIFIED,
    _verdict_to_cpi_status,
    compute_cpi_integrity,
)
from tests._helpers import seed_live_demo


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _attach_competitor(db, *, sku: str, title: str, price: float, scope: str = "demo:test"):
    """Make `sku` a CPI input: a canonical entity, a SKU link, and one competitor
    observation (the row that makes the entity part of an index)."""
    entity = pg.create_product_entity(db, canonical_title=title)
    pg.link_sku_to_entity(db, sku=sku, entity_id=entity.id)
    cp = CompetitorProduct(
        id=f"cp_{sku}",
        source_id="test-source",
        external_id=f"ext_{sku}",
        stable_key=f"key_{sku}",
        title=f"Competitor {title}",
        price=price,
        category="Grocery",
    )
    db.add(cp)
    db.flush()
    obs = CompetitorPriceObservation(
        id=f"obs_{sku}",
        competitor_product_id=cp.id,
        entity_id=entity.id,
        price=price,
        source_run_id=scope,
    )
    db.add(obs)
    db.flush()
    return entity


def _item_for_sku(result: dict, sku: str) -> dict:
    return next(i for i in result["items"] if i["sku"] == sku)


# ---------------------------------------------------------------------------
# unit-level verdict mapping (reuses the one eligibility rule)
# ---------------------------------------------------------------------------
def test_fully_verified_action_maps_to_cpi_verified(db):
    """An action whose every required channel verified the approved price maps
    to `verified` — the only kind of price an index should trust as "My Price"."""
    seed_live_demo(db)
    action = db.scalar(
        select(PriceAction).where(
            PriceAction.sku == "oj-nfc-premium-52oz",
            PriceAction.store_id == "302",
        )
    )
    assert action is not None
    verdict = measurement.derive_eligibility_for_action(db, action)
    status, observed = _verdict_to_cpi_status(action, verdict)
    assert status == CPI_VERIFIED
    assert observed is None  # nothing to surface when the price is confirmed


def test_pos_mismatch_action_maps_to_cpi_mismatch_with_observed_price(db):
    """A POS mismatch surfaces as `mismatch` and carries the ringing price so the
    index can show observed-vs-intended."""
    seed_live_demo(db)
    action = db.scalar(
        select(PriceAction).where(
            PriceAction.sku == "egg-cage-free-brown-12",
            PriceAction.store_id == "214",
        )
    )
    assert action is not None
    verdict = measurement.derive_eligibility_for_action(db, action)
    status, observed = _verdict_to_cpi_status(action, verdict)
    assert status == CPI_MISMATCH
    assert observed is not None  # the price the channel actually rang


# ---------------------------------------------------------------------------
# entity-level aggregation
# ---------------------------------------------------------------------------
def test_mismatch_dominates_at_entity_level(db):
    """The egg has a POS mismatch at one store; the index uses one approved price
    per product, so a single store ringing differently flags the whole input."""
    seed_live_demo(db)
    _attach_competitor(db, sku="egg-cage-free-brown-12", title="Cage-Free Eggs 12ct", price=4.10)

    result = compute_cpi_integrity(db)
    egg = _item_for_sku(result, "egg-cage-free-brown-12")
    assert egg["status"] == CPI_MISMATCH
    assert egg["observed_price"] is not None
    assert egg["intended_price"] is not None


def test_aggregate_counts_partition_inputs(db):
    """verified + unverified + mismatch always equals total_inputs, and
    total_inputs equals the number of items returned."""
    seed_live_demo(db)
    _attach_competitor(db, sku="egg-cage-free-brown-12", title="Eggs", price=4.10)
    _attach_competitor(db, sku="oj-nfc-premium-52oz", title="OJ", price=9.40)
    _attach_competitor(db, sku="strawberry-1lb", title="Strawberries", price=2.90)

    result = compute_cpi_integrity(db)
    assert result["total_inputs"] == len(result["items"])
    assert (
        result["verified"] + result["unverified"] + result["mismatch"]
        == result["total_inputs"]
    )
    # The egg input is present and flagged mismatch.
    assert _item_for_sku(result, "egg-cage-free-brown-12")["status"] == CPI_MISMATCH


def test_no_competitor_inputs_is_empty_not_error(db):
    """With no competitor observations attached, there are no index inputs — an
    empty, well-formed result (no div-by-zero, no crash)."""
    seed_live_demo(db)
    result = compute_cpi_integrity(db)
    assert result["total_inputs"] == 0
    assert result["items"] == []
    assert result["verified"] == result["unverified"] == result["mismatch"] == 0
    assert isinstance(result["summary"], str) and result["summary"]


# ---------------------------------------------------------------------------
# endpoint contract
# ---------------------------------------------------------------------------
def test_endpoint_returns_shape_and_flags_mismatch(db):
    seed_live_demo(db)
    _attach_competitor(db, sku="egg-cage-free-brown-12", title="Eggs", price=4.10)
    db.commit()  # the HTTP request runs in its own session — make writes visible

    client = TestClient(app)
    resp = client.get("/api/v1/product-graph/cpi-integrity")
    assert resp.status_code == 200
    body = resp.json()
    assert set(["total_inputs", "verified", "unverified", "mismatch", "summary", "items"]).issubset(body)
    assert body["total_inputs"] == len(body["items"])
    egg = _item_for_sku(body, "egg-cage-free-brown-12")
    assert egg["status"] == "mismatch"
    assert egg["observed_price"] is not None


def test_endpoint_scope_live_excludes_demo_scoped_inputs(db):
    """A demo-scoped competitor input must not appear under scope=live — the same
    Live/Demo boundary the rest of the platform enforces."""
    seed_live_demo(db)
    _attach_competitor(
        db, sku="egg-cage-free-brown-12", title="Eggs", price=4.10, scope="demo:test"
    )
    db.commit()  # the HTTP request runs in its own session — make writes visible
    client = TestClient(app)

    demo_resp = client.get("/api/v1/product-graph/cpi-integrity?scope=demo")
    assert demo_resp.status_code == 200
    assert demo_resp.json()["total_inputs"] >= 1

    live_resp = client.get("/api/v1/product-graph/cpi-integrity?scope=live")
    assert live_resp.status_code == 200
    live_skus = [i["sku"] for i in live_resp.json()["items"]]
    assert "egg-cage-free-brown-12" not in live_skus
