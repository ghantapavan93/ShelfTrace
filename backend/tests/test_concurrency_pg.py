"""Concurrency guarantees that only hold on PostgreSQL (FOR UPDATE / SKIP LOCKED).

Skipped automatically on SQLite. Run against the docker Postgres:
    DATABASE_URL=postgresql+psycopg2://shelftrace:shelftrace@localhost:5432/shelftrace_db pytest tests/test_concurrency_pg.py
"""
import threading

import pytest

from app.database import SessionLocal, engine
from app.models import (
    ChannelDelivery,
    Incident,
    IncidentStatus,
    IncidentType,
    OutboxStatus,
    OutboxEvent,
    PriceAction,
)
from app.seed import demo_payload
from app.services import orchestrator, recovery
from app.services.ingestion import ingest_batch

pg_only = pytest.mark.skipif(
    engine.dialect.name != "postgresql", reason="PostgreSQL-only concurrency test"
)


@pg_only
def test_concurrent_resolution_is_serialized(db):
    """Two operators acting on the same incident at once: the FOR UPDATE row lock
    serializes them so exactly one succeeds and the other is cleanly rejected."""
    from tests._helpers import seed_live_demo

    seed_live_demo(db)
    incident = db.query(Incident).filter(Incident.type == IncidentType.PRICE_MISMATCH).one()
    inc_id = incident.id

    results: dict[str, str] = {}

    def worker(name: str) -> None:
        s = SessionLocal()
        try:
            recovery.retry_incident(s, inc_id)
            results[name] = "ok"
        except recovery.RecoveryError:
            results[name] = "rejected"
        except Exception as exc:  # pragma: no cover
            results[name] = f"error:{exc}"
        finally:
            s.close()

    t1 = threading.Thread(target=worker, args=("a",))
    t2 = threading.Thread(target=worker, args=("b",))
    t1.start(); t2.start(); t1.join(); t2.join()

    assert sorted(results.values()) == ["ok", "rejected"], results

    s = SessionLocal()
    try:
        assert s.get(Incident, inc_id).status == IncidentStatus.RESOLVED
    finally:
        s.close()


@pg_only
def test_outbox_not_double_processed(db):
    """Multiple workers draining the same outbox concurrently must process each
    event once. SKIP LOCKED prevents duplicate publishes."""
    batch = ingest_batch(db, demo_payload()).batch  # 6 canary publish events, not drained
    canary = next(g for g in batch.rollout_groups if g.kind == "canary")
    canary_stores = set(canary.store_ids)

    errors: list[str] = []

    def worker() -> None:
        s = SessionLocal()
        try:
            for _ in range(8):
                orchestrator.process_outbox_once(s)
        except Exception as exc:  # pragma: no cover
            errors.append(str(exc))
        finally:
            s.close()

    threads = [threading.Thread(target=worker) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []

    s = SessionLocal()
    try:
        deliveries = (
            s.query(ChannelDelivery)
            .join(PriceAction, PriceAction.id == ChannelDelivery.action_id)
            .filter(PriceAction.store_id.in_(canary_stores))
            .count()
        )
        # Exactly 3 channels x 6 canary actions = 18, no duplicates.
        assert deliveries == 18
        dead = s.query(OutboxEvent).filter(OutboxEvent.status == OutboxStatus.DEAD_LETTER).count()
        assert dead == 0
    finally:
        s.close()
