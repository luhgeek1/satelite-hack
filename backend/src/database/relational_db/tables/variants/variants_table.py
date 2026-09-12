from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..mixins import CreatedAtMixin, TimestampMixin
from ..table_base import Base


class SimulationRunRow(Base, CreatedAtMixin):
    __tablename__ = "simulation_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scenario_id: Mapped[str | None] = mapped_column(
        ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    strategy: Mapped[str] = mapped_column(String(32), nullable=False, default="min_hops")

    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    effective_scenario: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    worst_availability: Mapped[float] = mapped_column(Float, nullable=False)
    mean_availability: Mapped[float] = mapped_column(Float, nullable=False)
    meets_target: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    environment_modified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    compute_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    __table_args__ = (Index("ix_simulation_runs_created", "created_at"),)


class VariantRow(Base, TimestampMixin):
    __tablename__ = "variants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("simulation_runs.id", ondelete="CASCADE"), nullable=False
    )

    run: Mapped[SimulationRunRow] = relationship(lazy="joined")

    __table_args__ = (Index("ix_variants_created", "created_at"),)
