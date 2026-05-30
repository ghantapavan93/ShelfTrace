"""Real Data Replay source records + Override Memory regression cases.

Revision ID: 0008_replay_and_source_records
Revises: 0007_reclassify_demo_seed

Brings the Alembic (production / USE_ALEMBIC=true) schema in line with the
models added after 0007 — which until now existed ONLY on the create_all +
db_migrate path used by the demo/test boot. On a real Render deploy (Alembic
only) these objects were missing, so the Decision Receipt view, the engineering
trace for any scenario batch, Real Data Replay, and the regression endpoints
all errored against PostgreSQL. This revision creates them:

  • source_datasets            (Real Data Replay — public reference datasets)
  • source_observations        (Real Data Replay — individual records)
  • regression_cases           (Override Memory / Regression Replay)
  • test_run_configs.source_observation_id  (links a scenario to a real record)

native_enum=False enum columns are stored as VARCHAR (matching the ORM), so the
migration uses plain String columns + the same index names create_all/the model
produce. Fully idempotent: every object is created only if absent, so it is safe
to run on a DB that was previously provisioned via create_all.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_replay_and_source_records"
down_revision: Union[str, None] = "0007_reclassify_demo_seed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts() -> sa.DateTime:
    return sa.DateTime(timezone=True)


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    # ── source_datasets ────────────────────────────────────────────────────
    if "source_datasets" not in existing_tables:
        op.create_table(
            "source_datasets",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("source_type", sa.String(length=32), nullable=False),
            sa.Column("source_name", sa.String(), nullable=False),
            sa.Column("attribution_text", sa.Text(), nullable=False),
            sa.Column("source_url", sa.Text(), nullable=False),
            sa.Column("license_or_usage_note", sa.Text(), nullable=False),
            sa.Column("imported_at", _ts(), nullable=False),
        )
        op.create_index(
            "ix_source_datasets_source_type", "source_datasets", ["source_type"]
        )

    # ── source_observations ────────────────────────────────────────────────
    if "source_observations" not in existing_tables:
        op.create_table(
            "source_observations",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "source_dataset_id",
                sa.String(),
                sa.ForeignKey("source_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("external_record_id", sa.String(), nullable=False),
            sa.Column("observation_type", sa.String(length=32), nullable=False),
            sa.Column("product_name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("brand", sa.String(), nullable=True),
            sa.Column("gtin_upc", sa.String(), nullable=True),
            sa.Column("region", sa.String(), nullable=True),
            sa.Column("observation_date", sa.String(), nullable=True),
            sa.Column("observed_price", sa.Float(), nullable=True),
            sa.Column("raw_payload_json", sa.Text(), nullable=False),
            sa.Column("normalized_payload_json", sa.Text(), nullable=False),
            sa.Column("imported_at", _ts(), nullable=False),
        )
        op.create_index(
            "ix_source_observations_source_dataset_id",
            "source_observations",
            ["source_dataset_id"],
        )
        op.create_index(
            "ix_source_observations_external_record_id",
            "source_observations",
            ["external_record_id"],
        )

    # ── regression_cases ───────────────────────────────────────────────────
    if "regression_cases" not in existing_tables:
        op.create_table(
            "regression_cases",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("case_type", sa.String(length=32), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("origin_incident_id", sa.String(), nullable=True),
            sa.Column("origin_action_id", sa.String(), nullable=True),
            sa.Column("sku", sa.String(), nullable=True),
            sa.Column("store_id", sa.String(), nullable=True),
            sa.Column("channel", sa.String(), nullable=True),
            sa.Column("expected_behavior", sa.Text(), nullable=False),
            sa.Column("failure_signature", sa.Text(), nullable=False),
            sa.Column("source_payload_json", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("created_at", _ts(), nullable=False),
            sa.Column("last_replayed_at", _ts(), nullable=True),
        )
        op.create_index("ix_regression_cases_case_type", "regression_cases", ["case_type"])
        op.create_index("ix_regression_cases_status", "regression_cases", ["status"])
        op.create_index(
            "ix_regression_cases_origin_incident_id", "regression_cases", ["origin_incident_id"]
        )
        op.create_index(
            "ix_regression_cases_origin_action_id", "regression_cases", ["origin_action_id"]
        )
        op.create_index("ix_regression_cases_sku", "regression_cases", ["sku"])
        op.create_index("ix_regression_cases_store_id", "regression_cases", ["store_id"])

    # ── test_run_configs.source_observation_id (+ index) ───────────────────
    trc_cols = {c["name"] for c in insp.get_columns("test_run_configs")} if "test_run_configs" in existing_tables else set()
    if "test_run_configs" in existing_tables and "source_observation_id" not in trc_cols:
        if bind.dialect.name == "postgresql":
            op.execute(
                "ALTER TABLE test_run_configs ADD COLUMN IF NOT EXISTS source_observation_id VARCHAR"
            )
            op.execute(
                "CREATE INDEX IF NOT EXISTS ix_test_run_configs_source_observation_id "
                "ON test_run_configs (source_observation_id)"
            )
        else:
            with op.batch_alter_table("test_run_configs") as batch:
                batch.add_column(sa.Column("source_observation_id", sa.String(), nullable=True))
                batch.create_index(
                    "ix_test_run_configs_source_observation_id", ["source_observation_id"]
                )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    if "test_run_configs" in existing_tables:
        trc_cols = {c["name"] for c in insp.get_columns("test_run_configs")}
        if "source_observation_id" in trc_cols:
            if bind.dialect.name == "postgresql":
                op.execute("DROP INDEX IF EXISTS ix_test_run_configs_source_observation_id")
                op.execute(
                    "ALTER TABLE test_run_configs DROP COLUMN IF EXISTS source_observation_id"
                )
            else:
                with op.batch_alter_table("test_run_configs") as batch:
                    batch.drop_index("ix_test_run_configs_source_observation_id")
                    batch.drop_column("source_observation_id")

    for table in ("regression_cases", "source_observations", "source_datasets"):
        if table in existing_tables:
            op.drop_table(table)
