"""The simulation loop: propagate, build the graph, route, summarise.

One full run over the official grid (720 instants, 48 satellites, 3 clients)
takes ~0.15 s, so simulation is synchronous everywhere — there is no job queue
behind `POST /simulations`. Only the optimizer, which runs hundreds of these,
needs background execution.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from . import geometry
from . import scenario as scenario_mod
from .metrics import ClientMetrics, summarise_client
from .routing import (
    NoRouteReason,
    RouteResult,
    RoutingStrategy,
    build_graph,
    find_route,
)
from .site_conditions import apply_site_conditions, prepare_horizons

EARTH_RADIUS_KM = geometry.R


@dataclass(frozen=True, slots=True)
class SatelliteState:
    id: str
    x_km: float
    y_km: float
    z_km: float
    lat_deg: float
    lon_deg: float
    alt_km: float
    active: bool


@dataclass(frozen=True, slots=True)
class SnapshotEdge:
    source: str
    target: str
    distance_km: float
    type: str  # "isl" | "ground" | "gateway"


@dataclass(frozen=True, slots=True)
class Snapshot:
    t_s: int
    satellites: tuple[SatelliteState, ...]
    edges: tuple[SnapshotEdge, ...]
    routes: dict[str, RouteResult]
    elevation_deg: dict[str, dict[str, float]]
    offline_gateways: frozenset[str]
    # Satellites above the scenario mask that a site's own surroundings hide.
    masked_satellites: dict[str, tuple[str, ...]]


@dataclass(slots=True)
class SimulationResult:
    """Everything one run produces.

    `routes` holds every (instant, client) pair because the official export
    format demands exactly that — one record per pair, empty path when there is
    no route — so it is cheaper to keep them than to recompute at export time.
    """

    effective_scenario: dict[str, Any]
    strategy: RoutingStrategy
    time_grid: tuple[int, ...]
    metrics: dict[str, ClientMetrics]
    routes: dict[int, dict[str, RouteResult]]
    satellite_positions: dict[int, tuple[SatelliteState, ...]] = field(default_factory=dict)
    duration_s: float = 0.0

    @property
    def step_s(self) -> int:
        return self.effective_scenario["environment"]["step_s"]

    @property
    def horizon_s(self) -> int:
        return self.effective_scenario["environment"]["horizon_s"]

    @property
    def target_availability(self) -> float:
        return self.effective_scenario["environment"]["target_availability"]

    @property
    def client_ids(self) -> list[str]:
        return [c["id"] for c in scenario_mod.clients(self.effective_scenario)]


def simulate(
    scenario: dict[str, Any],
    *,
    strategy: RoutingStrategy = RoutingStrategy.MIN_HOPS,
    keep_positions: bool = False,
) -> SimulationResult:
    """Run a scenario over its whole time grid.

    `keep_positions` is off by default: the optimizer runs this hundreds of times
    and only ever reads the metrics, so holding 720x48 positions per candidate
    would be pure waste.
    """
    import time

    started = time.perf_counter()

    env = scenario["environment"]
    grid = tuple(scenario_mod.time_grid(scenario))
    client_sites = scenario_mod.clients(scenario)
    client_ids = [c["id"] for c in client_sites]
    gateway_ids = [g["id"] for g in scenario_mod.gateways(scenario)]
    all_satellite_ids = scenario_mod.satellite_ids(scenario)

    visible: dict[str, list[bool]] = {cid: [] for cid in client_ids}
    masked: dict[str, list[bool]] = {cid: [] for cid in client_ids}
    routed: dict[str, list[bool]] = {cid: [] for cid in client_ids}
    hop_counts: dict[str, list[int | None]] = {cid: [] for cid in client_ids}
    reasons: dict[str, list[NoRouteReason | None]] = {cid: [] for cid in client_ids}

    routes: dict[int, dict[str, RouteResult]] = {}
    positions: dict[int, tuple[SatelliteState, ...]] = {}

    # Empty unless a site declares surroundings that raise its horizon, in
    # which case the organisers' snapshot is filtered before routing sees it.
    horizons = prepare_horizons(scenario)

    for t_s in grid:
        snap, masked_now = apply_site_conditions(geometry.snapshot(scenario, t_s), horizons)
        active_ids = {s["id"] for s in snap["satellites"] if s["active"]}
        graph = build_graph(
            snap["edges"],
            client_ids=client_ids,
            gateway_ids=gateway_ids,
            online_gateway_ids=set(gateway_ids) - scenario_mod.offline_gateway_ids(scenario, t_s),
            satellite_ids=active_ids,
        )

        step_routes: dict[str, RouteResult] = {}
        for client_id in client_ids:
            result = find_route(graph, client_id, strategy)
            step_routes[client_id] = result

            in_view = any(n in active_ids for n, _ in graph.neighbours(client_id))
            visible[client_id].append(in_view)
            # A satellite was above the scenario mask, but the site's own
            # horizon hid every one of them: visibility lost to surroundings.
            masked[client_id].append(not in_view and bool(masked_now.get(client_id)))
            routed[client_id].append(result.available)
            hop_counts[client_id].append(result.hops)
            reasons[client_id].append(result.reason)

        routes[t_s] = step_routes

        if keep_positions:
            positions[t_s] = _satellite_states(snap, all_satellite_ids)

    metrics = {
        client_id: summarise_client(
            client_id,
            step_s=env["step_s"],
            visible_flags=visible[client_id],
            masked_flags=masked[client_id],
            routed_flags=routed[client_id],
            hop_counts=hop_counts[client_id],
            reasons=reasons[client_id],
            target_availability=env["target_availability"],
        )
        for client_id in client_ids
    }

    return SimulationResult(
        effective_scenario=scenario,
        strategy=strategy,
        time_grid=grid,
        metrics=metrics,
        routes=routes,
        satellite_positions=positions,
        duration_s=time.perf_counter() - started,
    )


def snapshot_at(
    scenario: dict[str, Any],
    t_s: int,
    *,
    strategy: RoutingStrategy = RoutingStrategy.MIN_HOPS,
) -> Snapshot:
    """One instant, fully described — what the globe draws for a timeline position.

    Serving these on demand rather than shipping all 720 up front keeps the
    simulation response small: the full edge list for a day is ~8 MB, a single
    instant is ~13 KB.
    """
    snap, masked = apply_site_conditions(
        geometry.snapshot(scenario, t_s), prepare_horizons(scenario)
    )
    client_ids = [c["id"] for c in scenario_mod.clients(scenario)]
    gateway_ids = [g["id"] for g in scenario_mod.gateways(scenario)]
    offline = scenario_mod.offline_gateway_ids(scenario, t_s)
    active_ids = {s["id"] for s in snap["satellites"] if s["active"]}

    graph = build_graph(
        snap["edges"],
        client_ids=client_ids,
        gateway_ids=gateway_ids,
        online_gateway_ids=set(gateway_ids) - offline,
        satellite_ids=active_ids,
    )

    gateway_set = set(gateway_ids)
    ground_set = gateway_set | set(client_ids)
    edges = tuple(
        SnapshotEdge(
            source=a,
            target=b,
            distance_km=float(distance),
            type=_edge_type(a, b, ground_set, gateway_set),
        )
        for a, b, distance in snap["edges"]
    )

    return Snapshot(
        t_s=t_s,
        satellites=_satellite_states(snap, scenario_mod.satellite_ids(scenario)),
        edges=edges,
        routes={cid: find_route(graph, cid, strategy) for cid in client_ids},
        elevation_deg=snap["elevation_deg"],
        offline_gateways=frozenset(offline),
        masked_satellites={site_id: tuple(ids) for site_id, ids in masked.items() if ids},
    )


def _edge_type(a: str, b: str, ground: set[str], gateways: set[str]) -> str:
    if a in gateways or b in gateways:
        return "gateway"
    if a in ground or b in ground:
        return "ground"
    return "isl"


def _satellite_states(snap: dict[str, Any], order: Sequence[str]) -> tuple[SatelliteState, ...]:
    by_id = {s["id"]: s for s in snap["satellites"]}
    states = []
    for sat_id in order:
        sat = by_id[sat_id]
        lat, lon, alt = ecef_to_geodetic(sat["x_km"], sat["y_km"], sat["z_km"])
        states.append(
            SatelliteState(
                id=sat_id,
                x_km=sat["x_km"],
                y_km=sat["y_km"],
                z_km=sat["z_km"],
                lat_deg=lat,
                lon_deg=lon,
                alt_km=alt,
                active=sat["active"],
            )
        )
    return tuple(states)


def ecef_to_geodetic(x_km: float, y_km: float, z_km: float) -> tuple[float, float, float]:
    """Earth-fixed cartesian to lat/lon/altitude.

    The case models a spherical Earth, so this is the plain spherical conversion
    rather than a WGS-84 one — using an ellipsoid here would disagree with the
    elevation angles `geometry.py` computes.
    """
    radius = math.sqrt(x_km * x_km + y_km * y_km + z_km * z_km)
    if radius == 0.0:
        return 0.0, 0.0, -EARTH_RADIUS_KM
    lat = math.degrees(math.asin(max(-1.0, min(1.0, z_km / radius))))
    lon = math.degrees(math.atan2(y_km, x_km))
    return lat, lon, radius - EARTH_RADIUS_KM


def ephemeris(
    scenario: dict[str, Any],
    *,
    step_s: int | None = None,
) -> list[dict[str, Any]]:
    """Positions only, over the whole horizon — what the globe animates.

    `step_s` may coarsen the official grid (the UI interpolates between samples);
    it never refines it, so the samples always land on real calculation instants.
    """
    env = scenario["environment"]
    base_step = env["step_s"]
    sample_step = base_step if step_s is None else max(base_step, (step_s // base_step) * base_step)
    order = scenario_mod.satellite_ids(scenario)

    samples = []
    for t_s in range(0, env["horizon_s"], sample_step):
        snap = geometry.snapshot(scenario, t_s)
        samples.append({"t_s": t_s, "satellites": _satellite_states(snap, order)})
    return samples
