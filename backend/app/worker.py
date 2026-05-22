"""Standalone outbox worker.

Continuously drains pending outbox events (canary publish + reconcile). The API
also drains inline for single-node responsiveness; this worker exists to model
the production deployment where delivery is processed out of band via Redis.
"""
from __future__ import annotations

import logging
import time

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.services import orchestrator

logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger("shelftrace.worker")


def main() -> None:
    Base.metadata.create_all(bind=engine)
    logger.info("ShelfTrace outbox worker started")
    while True:
        try:
            with SessionLocal() as db:
                processed = orchestrator.process_outbox_once(db)
            if processed:
                logger.info("Processed %d outbox event(s)", processed)
        except Exception:  # pragma: no cover
            logger.exception("Worker loop error")
        time.sleep(1.0)


if __name__ == "__main__":
    main()
