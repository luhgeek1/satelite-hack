"""The official `cosmo-A-1.0` scenario, as Pydantic models.

These mirror the case schema exactly so FastAPI documents and pre-validates an
uploaded file, but they are *not* the validation authority: the engine still runs
the organisers' `geometry.validate` on the dict, and that is what decides whether
a scenario is acceptable. Keeping both means an obviously malformed upload gets a
field-precise 422 without reaching the engine, while the engine stays the arbiter
of the rules the case actually defines.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator

from domain.common import WireModel
from domain.scenario.config import SiteConditionsModel


class ScenarioMetaModel(WireModel):
    id: str = Field(..., min_length=1, max_length=128)
    title: str = Field(..., min_length=1, max_length=256)


class EnvironmentModel(WireModel):
    altitude_km: float = Field(..., ge=200, le=1200)
    inclination_deg: float = Field(..., gt=0, le=180)
    earth_angle0_deg: float
    horizon_s: int = Field(..., gt=0, le=172_800)
    step_s: int = Field(..., gt=0)
    min_elevation_deg: float = Field(..., ge=0, lt=90)
    isl_range_km: float = Field(..., gt=0, le=10_000)
    target_availability: float = Field(..., ge=0, le=1)


class PlaneModel(WireModel):
    id: str = Field(..., min_length=1, max_length=64)
    raan_deg: float = Field(..., ge=0, lt=360)
    phase_deg: float = Field(..., ge=0, lt=360)


class SatelliteModel(WireModel):
    id: str = Field(..., min_length=1, max_length=64)
    plane_id: str = Field(..., min_length=1, max_length=64)
    slot_deg: float
    launch_batch: Literal[1, 2, 3]


class ScenarioDesignModel(WireModel):
    launch_stage: Literal[1, 2, 3]
    planes: list[PlaneModel] = Field(..., min_length=1)
    satellites: list[SatelliteModel] = Field(..., min_length=1)


class GroundSiteModel(WireModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., max_length=256)
    role: Literal["client", "gateway"]
    lat_deg: float = Field(..., ge=-90, le=90)
    lon_deg: float = Field(..., ge=-180, le=180)
    # Our extension; the official validator ignores it, the engine checks it.
    site_conditions: SiteConditionsModel | None = None


class FailureModel(WireModel):
    satellite_id: str
    start_s: int = Field(..., ge=0)
    end_s: int = Field(..., gt=0)


class GatewayOutageModel(WireModel):
    gateway_id: str
    start_s: int = Field(..., ge=0)
    end_s: int = Field(..., gt=0)


class ScenarioModel(WireModel):
    schema_version: Literal["cosmo-A-1.0"]
    meta: ScenarioMetaModel
    environment: EnvironmentModel
    design: ScenarioDesignModel
    ground_sites: list[GroundSiteModel] = Field(..., min_length=2)
    failures: list[FailureModel] = Field(default_factory=list)
    gateway_outages: list[GatewayOutageModel] = Field(default_factory=list)

    @field_validator("ground_sites")
    @classmethod
    def _needs_both_roles(cls, sites: list[GroundSiteModel]) -> list[GroundSiteModel]:
        roles = {site.role for site in sites}
        if "client" not in roles or "gateway" not in roles:
            raise ValueError("ground_sites must contain at least one client and one gateway")
        return sites

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class ScenarioRenameRequest(WireModel):
    """Body of `PATCH /scenarios/{scenario_id}` — the only field a rename touches."""

    title: str = Field(..., min_length=1, max_length=256)


class ValidationReport(WireModel):
    """Result of a dry-run check, so the UI can report before it commits."""

    valid: bool
    error: str | None = None
    field: str | None = None


class ScenarioSummary(WireModel):
    """One row in the scenario picker."""

    id: str
    title: str
    source: Literal["official", "imported"]
    satellite_count: int
    plane_count: int
    client_count: int
    gateway_count: int
    launch_stage: int
    horizon_s: int
    step_s: int
    steps: int
    target_availability: float
    created_at: str | None = None


class ScenarioDetail(WireModel):
    """Everything the configuration panel and globe need to draw an unrun scenario."""

    summary: ScenarioSummary
    scenario: dict[str, Any]
