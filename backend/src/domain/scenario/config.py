"""The configuration overlay: what the right-hand panel can change.

This is the exact payload the UI holds, so a run request carries the panel state
verbatim and nothing has to be reassembled on either side.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import Field, model_validator

from domain.common import WireModel


class RoutingStrategyName(StrEnum):
    MIN_HOPS = "min_hops"
    MIN_DISTANCE = "min_distance"


class PlaneConfigModel(WireModel):
    """Omitted fields keep the scenario's value — the panel sends only what it moved."""

    raan_deg: float | None = Field(None, ge=0, lt=360)
    phase_deg: float | None = Field(None, ge=0, lt=360)


class FailureConfigModel(WireModel):
    satellite_id: str
    start_s: int = Field(..., ge=0)
    end_s: int = Field(..., gt=0)

    @model_validator(mode="after")
    def _ordered(self) -> FailureConfigModel:
        if self.end_s <= self.start_s:
            raise ValueError("end_s must be greater than start_s")
        return self


class GatewayOutageConfigModel(WireModel):
    gateway_id: str
    start_s: int = Field(..., ge=0)
    end_s: int = Field(..., gt=0)

    @model_validator(mode="after")
    def _ordered(self) -> GatewayOutageConfigModel:
        if self.end_s <= self.start_s:
            raise ValueError("end_s must be greater than start_s")
        return self


class ConfigModel(WireModel):
    """Overrides applied to a base scenario before a run.

    `failures` and `gateway_outages` replace the scenario's lists when present
    and leave them untouched when absent, so the panel can own the full list
    without needing add/remove verbs.

    The environment block is separate from the design block on purpose: the case
    says variants are compared at a fixed altitude, ISL range and elevation mask,
    so touching those marks the run as a sensitivity study rather than a design
    variant, and every response echoes the effective environment back.
    """

    launch_stage: Literal[1, 2, 3] | None = None
    planes: dict[str, PlaneConfigModel] = Field(default_factory=dict)
    failures: list[FailureConfigModel] | None = None
    gateway_outages: list[GatewayOutageConfigModel] | None = None

    isl_range_km: float | None = Field(None, gt=0, le=10_000)
    min_elevation_deg: float | None = Field(None, ge=0, lt=90)
    altitude_km: float | None = Field(None, ge=200, le=1200)
    inclination_deg: float | None = Field(None, gt=0, le=180)
    step_s: int | None = Field(None, gt=0)
    horizon_s: int | None = Field(None, gt=0, le=172_800)

    @property
    def touches_environment(self) -> bool:
        return any(
            value is not None
            for value in (
                self.isl_range_km,
                self.min_elevation_deg,
                self.altitude_km,
                self.inclination_deg,
                self.step_s,
                self.horizon_s,
            )
        )
