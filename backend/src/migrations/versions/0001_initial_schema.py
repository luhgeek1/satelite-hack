"""Initial schema: scenarios, simulation runs, saved variants.

Revision ID: 0001_initial
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scenarios",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="imported"),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_scenarios_source_created", "scenarios", ["source", "created_at"])

    op.create_table(
        "simulation_runs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("scenario_id", sa.String(length=128), nullable=True),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("strategy", sa.String(length=32), nullable=False, server_default="min_hops"),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("effective_scenario", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("worst_availability", sa.Float(), nullable=False),
        sa.Column("mean_availability", sa.Float(), nullable=False),
        sa.Column("meets_target", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("environment_modified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("compute_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_simulation_runs_created", "simulation_runs", ["created_at"])

    op.create_table(
        "variants",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("run_id", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["run_id"], ["simulation_runs.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_variants_created", "variants", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_variants_created", table_name="variants")
    op.drop_table("variants")
    op.drop_index("ix_simulation_runs_created", table_name="simulation_runs")
    op.drop_table("simulation_runs")
    op.drop_index("ix_scenarios_source_created", table_name="scenarios")
    op.drop_table("scenarios")
