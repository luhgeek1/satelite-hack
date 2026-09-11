"""Simulation request and response shapes.

A run is synchronous: the full official grid takes ~0.15 s, so `POST
/simulations` returns the finished summary rather than a job handle. Only the
optimizer, which evaluates hundreds of configurations, needs the job protocol.

The summary is deliberately everything-but-the-heavy-parts. Positions and the
link graph are fetched separately, because all 720 instants with their edges come
to ~8 MB while one instant is ~13 KB and arrives instantly as the engineer drags
the timeline.
"""

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
    """Run a scenario, either one we already hold or one supplied inline.

    Supplying `scenario` inline keeps the jury's "load a file and run it" path to
    a single request, with no import step to fail in between.
    """

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
    """A gap with no route.

    `leading`/`trailing` mark gaps touching the ends of the horizon: their true
    length is unknown, so they are reported apart from `max_bounded_outage_s`,
    which is the number worth comparing between variants.
    """

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


class AvailabilitySample(WireModel):
    """Per-instant availability flags — what the timeline strip under the globe draws.

    Three states, not two: `visible_no_route` is the whole point of the case, and
    collapsing it into "no service" would hide the difference between "no
    satellite overhead" and "satellite overhead but the mesh cannot reach the
    gateway".
    """

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
    effective_scenario: dict[str, Any]
    compute_ms: float


class SatelliteStateModel(WireModel):
    """Position in both frames.

    `lat_deg`/`lon_deg`/`alt_km` is what the globe consumes directly; the
    Earth-fixed cartesian triple is kept because it is what `geometry.py`
    actually produces, and a technical reviewer can check our conversion against
    the module's own output without re-deriving it.
    """

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
    """One instant of the network, fully described."""

    t_s: int
    satellites: list[SatelliteStateModel]
    edges: list[SnapshotEdgeModel]
    routes: list[RouteModel]
    elevation_deg: dict[str, dict[str, float]]
    offline_gateways: list[str]
    active_satellites: int
    total_satellites: int


class EphemerisSample(WireModel):
    t_s: int
    satellites: list[SatelliteStateModel]


class EphemerisResponse(WireModel):
    """Positions over the whole horizon, for the globe's animation.

    At the official grid this is ~1 MB uncompressed and ~324 KB gzipped for a
    full day, so it ships in one response; `step_s` can coarsen it further when
    the client would rather interpolate.
    """

    step_s: int
    horizon_s: int
    samples: list[EphemerisSample]


class RouteTimelineResponse(WireModel):
    """Every instant's route for one client — what the route inspector scrubs through."""

    client_id: str
    step_s: int
    routes: list[RouteModel]
