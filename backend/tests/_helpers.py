"""Shared test helpers."""
from app.services import scenarios


def seed_live_demo(db):
    """Seed + execute the Memorial Day scenario as a live rollout (config-driven)."""
    config = scenarios.ensure_memorial_day(db)
    return scenarios.execute_live(db, config)
