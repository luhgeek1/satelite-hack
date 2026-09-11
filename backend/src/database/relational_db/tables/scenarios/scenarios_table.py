"""Stored scenarios: the four official ones plus whatever the jury uploads.

The payload is kept as the original `cosmo-A-1.0` document in a JSONB column
rather than shredded into tables. The schema is the organisers' to change, and a
scenario is only ever read whole and handed to the engine, so normalising it
would buy nothing and would quietly break the day a jury file uses a field we
did not model.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..mixins import TimestampMixin
from ..table_base import Base


class ScenarioRow(Base, TimestampMixin):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="imported")
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_scenarios_source_created", "source", "created_at"),)
