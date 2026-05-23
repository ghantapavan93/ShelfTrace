"""Baseline schema.

This migration onboards Alembic onto an existing project. Rather than emit
~20 explicit ``op.create_table`` calls (and risk drifting from the live model
metadata), it asks SQLAlchemy to materialise every model defined on
``Base.metadata``. That is idempotent on Postgres (existing tables are skipped
via ``checkfirst=True``) so this safely re-runs on databases provisioned via
the legacy ``Base.metadata.create_all`` path.

Subsequent migrations should be generated with::

    alembic revision --autogenerate -m "describe the change"

and should contain explicit ``op.add_column`` / ``op.create_index`` calls.

Revision ID: 0001_baseline
Revises:
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from app.database import Base
# Side-effect: importing models registers tables on Base.metadata.
from app import models  # noqa: F401

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
