from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, model_validator

from domain.common import WireModel
from domain.scenario.config import ConfigModel, RoutingStrategyName


class ResilienceRequest(WireModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    config: ConfigModel = Field(default_factory=ConfigModel)
    strategy: RoutingStrategyName = RoutingStrategyName.MIN_HOPS
    satellite_ids: list[str] | None = Field(
        None,
        description="Restrict the sweep to these satellites; defaults to every one that flies",
    )


class SatelliteImpactModel(WireModel):
    satellite_id: str
    plane_id: str
    worst_availability_drop: float
    mean_availability_drop: float
    per_client_drop: dict[str, float]
    breaks_target: bool
    criticality: float = Field(..., ge=0, le=100)


class GatewayDependencyModel(WireModel):
    gateway_id: str
    serving_satellites: list[str]
    busiest_satellite: str | None
    busiest_share: float
    contact_availability: float
    routed_share_by_client: dict[str, float]


class ResilienceResponse(WireModel):
    baseline_worst_availability: float
    baseline_mean_availability: float
    target_availability: float
    impacts: list[SatelliteImpactModel]
    critical_satellite_ids: list[str]
    gateway_dependency: list[GatewayDependencyModel]
    compute_ms: float


class SensitivityRequest(WireModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    config: ConfigModel = Field(default_factory=ConfigModel)
    strategy: RoutingStrategyName = RoutingStrategyName.MIN_HOPS
    parameter: Literal["isl_range_km", "min_elevation_deg", "altitude_km", "inclination_deg"]
    values: list[float] = Field(..., min_length=1, max_length=64)


class SensitivityPointModel(WireModel):
    value: float
    worst_availability: float
    per_client: dict[str, float]
    meets_target: bool


class SensitivityResponse(WireModel):
    parameter: str
    points: list[SensitivityPointModel]
    threshold: float | None = Field(
        None,
        description="Lowest swept value at which every client meets the target, when one exists",
    )
    compute_ms: float


class PlaneBoundsModel(WireModel):
    plane_id: str
    raan_deg: tuple[float, float] | None = None
    phase_deg: tuple[float, float] | None = None


class OptimizeRequest(WireModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    config: ConfigModel = Field(default_factory=ConfigModel)
    strategy: RoutingStrategyName = RoutingStrategyName.MIN_HOPS
    objective: Literal["worst_first", "mean_first"] = Field(
        "worst_first",
        description="Rank on the worst-served client (matches the case's per-client target) "
        "or on the mean across clients (what the organisers suggested at the Q&A)",
    )
    bounds: list[PlaneBoundsModel] = Field(..., min_length=1)
    method: Literal["coordinate_descent", "grid"] = Field(
        "coordinate_descent",
        description="Move one angle at a time from several starting points, or enumerate "
        "the full grid. The grid costs coarse_steps ** free_axes full-day simulations "
        "and samples each angle far more coarsely for the same budget",
    )
    coarse_steps: int = Field(6, ge=2, le=24, description="Grid: samples per axis")
    refine_rounds: int = Field(2, ge=0, le=4, description="Local steps around the winner")
    axis_steps: int = Field(12, ge=2, le=64, description="Descent: samples per axis sweep")
    passes: int = Field(3, ge=1, le=8, description="Descent: sweeps over every axis")
    starts: int = Field(3, ge=1, le=8, description="Descent: independent starting points")


class CandidateModel(WireModel):
    planes: dict[str, dict[str, float | None]]
    worst_availability: float
    mean_availability: float
    worst_outage_s: int
    mean_hops: float


class OptimizeResult(WireModel):
    baseline: CandidateModel
    best: CandidateModel
    objective: Literal["worst_first", "mean_first"]
    improved: bool
    explored: int
    changed_planes: dict[str, dict[str, float | None]]
    verdict: str = Field(
        ...,
        description="Plain-language conclusion, including the honest negative case "
        "where the target is unreachable by phasing alone",
    )


class JobStatusModel(WireModel):
    id: str
    kind: Literal["optimize"]
    status: Literal["queued", "running", "done", "failed"]
    progress: float = Field(..., ge=0, le=1)
    explored: int = 0
    total: int = 0
    error: str | None = None
    created_at: str
    finished_at: str | None = None


class VariantCreate(WireModel):
    name: str = Field(..., min_length=1, max_length=120)
    note: str | None = Field(None, max_length=1000)
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    config: ConfigModel = Field(default_factory=ConfigModel)
    strategy: RoutingStrategyName = RoutingStrategyName.MIN_HOPS


class VariantModel(WireModel):
    id: str
    name: str
    note: str | None
    scenario_id: str | None
    scenario_title: str
    config: ConfigModel
    strategy: RoutingStrategyName
    created_at: str

    worst_availability: float
    mean_availability: float
    meets_target: bool
    max_bounded_outage_s: int
    availability_by_client: dict[str, float]
    environment_modified: bool


class ParameterDiff(WireModel):
    path: str
    label: str
    values: list[float | int | str | None]


class ComparedMetric(WireModel):
    key: str
    label: str
    unit: Literal["fraction", "seconds", "hops", "count"]
    values: list[float | int | None]
    higher_is_better: bool


class CompareRequest(WireModel):
    variant_ids: list[str] = Field(..., min_length=2, max_length=4)

    @model_validator(mode="after")
    def _distinct(self) -> CompareRequest:
        if len(set(self.variant_ids)) != len(self.variant_ids):
            raise ValueError("variant_ids must be distinct")
        return self


class CompareResponse(WireModel):
    variants: list[VariantModel]
    changed_parameters: list[ParameterDiff]
    metrics: list[ComparedMetric]
    per_client_availability: dict[str, list[float]]
    recommendation: str
