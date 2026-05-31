import os

# Tests must NEVER touch the live demo database. Resolve an isolated test DB
# *before* importing any app module (settings/engine are read at import time):
#   - SQLite (local default): a throwaway file.
#   - Postgres (docker/CI): a sibling "<db>_test" database, created if missing,
#     so `pytest` against the running stack can't wipe the demo data.
_raw = os.environ.get("DATABASE_URL", "sqlite:///./test_shelftrace.db")

if _raw.startswith("postgresql"):
    base, _, dbname = _raw.rpartition("/")
    test_dbname = f"{dbname}_test"
    test_url = f"{base}/{test_dbname}"

    from sqlalchemy import create_engine, text

    _admin = create_engine(_raw, isolation_level="AUTOCOMMIT")
    with _admin.connect() as _c:
        _exists = _c.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": test_dbname}
        ).scalar()
        if not _exists:
            _c.execute(text(f'CREATE DATABASE "{test_dbname}"'))
    _admin.dispose()

    os.environ["DATABASE_URL"] = test_url
else:
    os.environ["DATABASE_URL"] = _raw

os.environ.setdefault("DEMO_MODE", "true")

import pytest  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402


@pytest.fixture()
def db():
    # A prior test that hit a StreamingResponse endpoint (e.g. export.csv) can
    # leave its request connection checked out and idle-in-transaction, holding
    # a lock that blocks the drop_all below until lock_timeout. engine.dispose()
    # only reclaims *idle pooled* connections, not a still-checked-out one — so
    # on PostgreSQL we also terminate any other backend on the test DB to start
    # each test from a clean, lock-free schema. SQLite enforces no such locks,
    # which is why this isolation gap only ever surfaced on Postgres.
    engine.dispose()
    if engine.url.get_backend_name() == "postgresql":
        from sqlalchemy import text

        with engine.begin() as _c:
            _c.execute(text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = current_database() AND pid <> pg_backend_pid()"
            ))
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
