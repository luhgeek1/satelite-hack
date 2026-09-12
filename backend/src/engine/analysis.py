from __future__ import annotations

import copy
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from typing import Any

from .metrics import mean_availability, worst_availability
from .parallel import pin_worker_threads, resolve_workers
from .routing import RoutingStrategy
from .scenario import active_satellite_ids, satellite_ids
from .simulate import simulate


@dataclass(frozen=True, slots=True)
class SatelliteImpact:
    satellite_id: str
    worst_availability_drop: float
    mean_availability_drop: float
    per_client_drop: dict[str, float]
    breaks_target: bool
    criticality: float  # 0…100, for the globe's colour scale


@dataclass(frozen=True, slots=True)
class ResilienceReport:
    baseline_worst_availability: float
    baseline_mean_availability: float
    target_availability: float
    impacts: tuple[SatelliteImpact, ...]

    @property
    def critical(self) -> tuple[SatelliteImpact, ...]:
        return tuple(i for i in self.impacts if i.breaks_target)


def analyse_resilience(
    scenario: dict[str, Any],
    *,
    strategy: RoutingStrategy = RoutingStrategy.MIN_HOPS,
    satellites: Sequence[str] | None = None,
    max_workers: int | None = None,
) -> ResilienceReport:
    baseline = simulate(scenario, strategy=strategy)
    base_worst = worst_availability(baseline.metrics)
    base_mean = mean_availability(baseline.metrics)
    base_per_client = {cid: m.availability for cid, m in baseline.metrics.items()}
    target = scenario["environment"]["target_availability"]

    candidates = list(satellites) if satellites is not None else _live_satellites(scenario)
    if not candidates:
        return ResilienceReport(base_worst, base_mean, target, ())

    payloads = [(scenario, sat_id, strategy) for sat_id in candidates]
    workers = resolve_workers(max_workers)
    if workers == 1 or len(candidates) == 1:
        outcomes = [_knockout(p) for p in payloads]
    else:
        with ProcessPoolExecutor(max_workers=workers, initializer=pin_worker_threads) as pool:
            outcomes = list(pool.map(_knockout, payloads, chunksize=4))

    impacts = []
    for sat_id, worst, mean, per_client in outcomes:
        drop = base_worst - worst
        impacts.append(
            SatelliteImpact(
                satellite_id=sat_id,
                worst_availability_drop=drop,
                mean_availability_drop=base_mean - mean,
                per_client_drop={
                    cid: base_per_client[cid] - per_client.get(cid, 0.0) for cid in base_per_client
                },
                breaks_target=worst < target <= base_worst,
                criticality=0.0,  # filled in below, once the range is known
            )
        )

    return ResilienceReport(
        baseline_worst_availability=base_worst,
        baseline_mean_availability=base_mean,
        target_availability=target,
        impacts=tuple(_score(impacts)),
    )


def _live_satellites(scenario: dict[str, Any]) -> list[str]:
    horizon = scenario["environment"]["horizon_s"]
    step = scenario["environment"]["step_s"]
    ever_active: set[str] = set()
    for t_s in range(0, horizon, step):
        ever_active |= active_satellite_ids(scenario, t_s)
    return [sat_id for sat_id in satellite_ids(scenario) if sat_id in ever_active]


def _knockout(
    payload: tuple[dict[str, Any], str, RoutingStrategy],
) -> tuple[str, float, float, dict[str, float]]:
    scenario, satellite_id, strategy = payload
    probe = copy.deepcopy(scenario)
    probe["failures"] = list(probe["failures"]) + [
        {
            "satellite_id": satellite_id,
            "start_s": 0,
            "end_s": probe["environment"]["horizon_s"],
        }
    ]
    result = simulate(probe, strategy=strategy)
    return (
        satellite_id,
        worst_availability(result.metrics),
        mean_availability(result.metrics),
        {cid: m.availability for cid, m in result.metrics.items()},
    )


def _score(impacts: list[SatelliteImpact]) -> list[SatelliteImpact]:
    worst = max((i.worst_availability_drop for i in impacts), default=0.0)
    if worst <= 0.0:
        return [SatelliteImpact(**{**_as_dict(i), "criticality": 0.0}) for i in impacts]

    scored = []
    for impact in impacts:
        ratio = max(0.0, impact.worst_availability_drop) / worst
        score = 100.0 * ratio
        if impact.breaks_target:
            score = max(score, 85.0)  # always lands in the "critical" bucket
        scored.append(SatelliteImpact(**{**_as_dict(impact), "criticality": round(score, 1)}))
    return scored


def _as_dict(impact: SatelliteImpact) -> dict[str, Any]:
    return {
        "satellite_id": impact.satellite_id,
        "worst_availability_drop": impact.worst_availability_drop,
        "mean_availability_drop": impact.mean_availability_drop,
        "per_client_drop": impact.per_client_drop,
        "breaks_target": impact.breaks_target,
        "criticality": impact.criticality,
    }


@dataclass(frozen=True, slots=True)
class GatewayDependency:
    gateway_id: str
    serving_satellites: tuple[str, ...]
    last_hop_share: dict[str, float]
    busiest_satellite: str | None
    busiest_share: float
    contact_availability: float
    routed_share_by_client: dict[str, float]


def analyse_gateway_dependency(
    scenario: dict[str, Any],
    *,
    strategy: RoutingStrategy = RoutingStrategy.MIN_HOPS,
) -> list[GatewayDependency]:
    from collections import Counter

    from .scenario import gateways as gateway_sites
    from .simulate import simulate as _simulate

    result = _simulate(scenario, strategy=strategy)
    steps = len(result.time_grid)
    reports: list[GatewayDependency] = []

    for gateway in gateway_sites(scenario):
        gateway_id = gateway["id"]
        last_hops: Counter[str] = Counter()
        routed_by_client: Counter[str] = Counter()
        contact_steps = 0

        for t_s in result.time_grid:
            used_here = False
            for client_id, route in result.routes[t_s].items():
                if route.gateway_id != gateway_id or len(route.path) < 2:
                    continue
                last_hops[route.path[-2]] += 1
                routed_by_client[client_id] += 1
                used_here = True
            contact_steps += used_here

        total = sum(last_hops.values())
        share = {sat: count / total for sat, count in last_hops.items()} if total else {}
        busiest = max(share, key=lambda sat: share[sat]) if share else None

        reports.append(
            GatewayDependency(
                gateway_id=gateway_id,
                serving_satellites=tuple(sorted(last_hops)),
                last_hop_share={sat: round(value, 6) for sat, value in share.items()},
                busiest_satellite=busiest,
                busiest_share=round(share[busiest], 6) if busiest else 0.0,
                contact_availability=contact_steps / steps if steps else 0.0,
                routed_share_by_client={
                    client_id: count / steps for client_id, count in routed_by_client.items()
                },
            )
        )

    return reports
