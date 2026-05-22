import os

# Use an isolated SQLite DB for tests unless one is provided. Must be set before
# importing app modules (settings are read at import time).
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_shelftrace.db")
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
