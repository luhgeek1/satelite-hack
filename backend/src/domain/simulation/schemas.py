from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from domain.common import WireModel
from domain.scenario.config import ConfigModel, RoutingStrategyName

NoRouteReasonName = Literal[
    "no_visible_satellite",
    "network_partition",
    "no_gateway_contact",
    "gateway_unavailable",
]


class RunRequest(WireModel):
    scenario_id: str | None = None
    scenario: dict[str, Any] | None = None
    config: ConfigModel = Field(default_factory=ConfigModel)
    strategy: RoutingStrategyName = RoutingStrategyName.MIN_HOPS
    label: str | None = Field(None, max_length=120)

    def resolved(self) -> Literal["stored", "inline"]:
        if (self.scenario_id is None) == (self.scenario is None):
            raise ValueError("Provide exactly one of scenario_id or scenario")
        return "stored" if self.scenario_id else "inline"


class OutageWindowModel(WireModel):
    client_id: str
    start_s: int
    end_s: int
    duration_s: int
    reason: NoRouteReasonName | None
    leading: bool
    trailing: bool


class ClientMetricsModel(WireModel):
    client_id: str
    name: str
    visibility: float = Field(..., description="Fraction 0…1 of instants with a satellite in view")
    availability: float = Field(
        ..., description="Fraction 0…1 of instants with a route to a gateway"
    )
    meets_target: bool
    max_outage_s: int
    max_bounded_outage_s: int
    leading_outage_s: int
    trailing_outage_s: int
    avg_hops: float | None
    min_hops: int | None
    max_hops: int | None
    outage_reasons: dict[str, int]
    outage_windows: list[OutageWindowModel]
    site_profile: str | None = Field(
        None, description="Surroundings profile applied to this site, if any"
    )
    effective_mask_deg: float | None = Field(
        None, description="The elevation mask the site actually saw: scenario mask or higher"
    )
    masked_share: float = Field(
        0.0,
        description="Fraction 0…1 of instants a satellite cleared the scenario mask "
        "but the site's surroundings hid every one",
    )


class AvailabilitySample(WireModel):
    t_s: int
    state: dict[str, Literal["routed", "visible_no_route", "no_satellite"]]


class SimulationSummary(WireModel):
    id: str
    scenario_id: str | None
    label: str | None
    strategy: RoutingStrategyName
    created_at: str

    target_availability: float
    step_s: int
    horizon_s: int
    steps: int

    worst_availability: float
    mean_availability: float
    meets_target: bool
    clients: list[ClientMetricsModel]

    config: ConfigModel
    environment_modified: bool = Field(
        ...,
        description="True when the run changed altitude/ISL range/elevation mask, "
        "which makes it a sensitivity study rather than a comparable design variant",
    )
    site_conditions_active: bool = Field(
        False,
        description="True when at least one ground site models terrain, buildings or "
        "altitude that raise its horizon above the scenario mask",
    )
    effective_scenario: dict[str, Any]
    compute_ms: float


class SatelliteStateModel(WireModel):
    id: str
    lat_deg: float
    lon_deg: float
    alt_km: float
    x_km: float
    y_km: float
    z_km: float
    active: bool


class SnapshotEdgeModel(WireModel):
    source: str
    target: str
    distance_km: float
    type: Literal["isl", "ground", "gateway"]


class RouteModel(WireModel):
    client_id: str
    available: bool
    path: list[str]
    hops: int | None
    distance_km: float | None
    reason: NoRouteReasonName | None
    gateway_id: str | None


class SnapshotResponse(WireModel):
    t_s: int
    satellites: list[SatelliteStateModel]
    edges: list[SnapshotEdgeModel]
    routes: list[RouteModel]
    elevation_deg: dict[str, dict[str, float]]
    offline_gateways: list[str]
    masked_satellites: dict[str, list[str]] = Field(
        default_factory=dict,
        description="Per site: satellites above the scenario mask that its surroundings hide",
    )
    active_satellites: int
    total_satellites: int


class EphemerisSample(WireModel):
    t_s: int
    satellites: list[SatelliteStateModel]


class EphemerisResponse(WireModel):
    step_s: int
    horizon_s: int
    samples: list[EphemerisSample]


class RouteTimelineResponse(WireModel):
    client_id: str
    step_s: int
    routes: list[RouteModel]
