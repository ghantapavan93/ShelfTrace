"""Add import provenance to scenario configs.

Revision ID: 0004_import_provenance
Revises: 0003_product_knowledge_graph
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004_import_provenance"
down_revision: Union[str, None] = "0003_product_knowledge_graph"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type(bind):
    if bind.dialect.name == "postgresql":
        return postgresql.JSONB(astext_type=sa.Text())
    return sa.JSON()


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE test_run_configs ADD COLUMN IF NOT EXISTS import_source_hash VARCHAR(64)")
        op.execute("ALTER TABLE test_run_configs ADD COLUMN IF NOT EXISTS import_source_name VARCHAR(256)")
        op.execute("ALTER TABLE test_run_configs ADD COLUMN IF NOT EXISTS import_summary_json JSONB")
        op.execute("ALTER TABLE test_run_configs ADD COLUMN IF NOT EXISTS created_by VARCHAR(128)")
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_test_run_configs_import_source_hash "
            "ON test_run_configs (import_source_hash)"
        )
        return

    with op.batch_alter_table("test_run_configs") as batch:
        batch.add_column(sa.Column("import_source_hash", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("import_source_name", sa.String(length=256), nullable=True))
        batch.add_column(sa.Column("import_summary_json", _json_type(bind), nullable=True))
        batch.add_column(sa.Column("created_by", sa.String(length=128), nullable=True))
        batch.create_index("ix_test_run_configs_import_source_hash", ["import_source_hash"])


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_test_run_configs_import_source_hash")
        op.execute("ALTER TABLE test_run_configs DROP COLUMN IF EXISTS created_by")
        op.execute("ALTER TABLE test_run_configs DROP COLUMN IF EXISTS import_summary_json")
        op.execute("ALTER TABLE test_run_configs DROP COLUMN IF EXISTS import_source_name")
        op.execute("ALTER TABLE test_run_configs DROP COLUMN IF EXISTS import_source_hash")
        return

    with op.batch_alter_table("test_run_configs") as batch:
        batch.drop_index("ix_test_run_configs_import_source_hash")
        batch.drop_column("created_by")
        batch.drop_column("import_summary_json")
        batch.drop_column("import_source_name")
        batch.drop_column("import_source_hash")
