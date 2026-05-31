"""Demo reset must be bounded and idempotent.

The reviewer-facing guarantee: a reset restores the two seeded hero demos
(Memorial Day + Organic Whole Milk) and removes any OTHER executed live batch,
so prior-session scenarios and realistic-scale runs never pile up on the public
Operations surface. Two consecutive resets must leave the SAME set of live
batches — while saved scenario CONFIGS survive so they can be re-run.
"""
from __future__ import annotations

from sqlalchemy import select

from app.models import PriceBatch, RunMode
from app.schemas import ScenarioActionIn, ScenarioIn
from app.seed import (
    DEMO_EXTERNAL_ID,
    MILK_HERO_EXTERNAL_ID,
    purge_non_seed_live_batches,
    seed_live,
)
from app.services import scenarios

HEROES = {DEMO_EXTERNAL_ID, MILK_HERO_EXTERNAL_ID}


def _live_external_ids(db) -> set[str]:
    return {
        b.external_id
        for b in db.scalars(
            select(PriceBatch).where(PriceBatch.run_mode == RunMode.LIVE_ROLLOUT)
        )
    }


def _custom_scenario(name: str, sku: str) -> ScenarioIn:
    """A non-seeded scenario with a product OUTSIDE the demo (proves the purge
    targets leftovers, not just the heroes)."""
    return ScenarioIn(
        name=name,
        run_mode="live_rollout",
        zone_name="Test Zone",
        store_ids=["s1", "s2"],
        canary_store_ids=["s1"],
        actions=[
            ScenarioActionIn(
                product_name="Hass Avocados, 4 Count",
                sku=sku,
                previous_price=5.49,
                approved_price=4.99,
                reason="promo",
            )
        ],
        behaviors=[],
    )


def _seed_both_heroes(db) -> None:
    seed_live(db)  # memorial-day-dallas-02
    milk = scenarios.ensure_milk_hero(db)
    scenarios.execute_live(db, milk)  # milk-hero-dallas-02


def test_purge_removes_non_seed_live_batches_but_keeps_heroes(db):
    _seed_both_heroes(db)

    # A reviewer (or a prior session) runs a custom non-seed scenario.
    debris = scenarios.create_config(db, _custom_scenario("Throwaway Avocado", "avocado-x1"))
    scenarios.execute_live(db, debris)

    before = _live_external_ids(db)
    assert HEROES <= before  # both heroes present
    assert before - HEROES  # at least one non-hero leftover exists

    removed = purge_non_seed_live_batches(db)
    assert removed >= 1
    assert _live_external_ids(db) == HEROES  # only the heroes survive

    # The saved CONFIG is preserved — only its stale executed batch was cleared.
    assert scenarios.get_config(db, debris.id) is not None


def test_reset_purge_is_idempotent(db):
    _seed_both_heroes(db)
    debris = scenarios.create_config(db, _custom_scenario("Leftover Run", "leftover-1"))
    scenarios.execute_live(db, debris)

    # First purge clears the leftover; a second purge is a no-op and leaves the
    # exact same set — proving two consecutive resets converge to one state.
    assert purge_non_seed_live_batches(db) >= 1
    first = _live_external_ids(db)
    assert purge_non_seed_live_batches(db) == 0
    second = _live_external_ids(db)
    assert first == second == HEROES
