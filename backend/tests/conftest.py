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
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
