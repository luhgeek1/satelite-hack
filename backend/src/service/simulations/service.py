"""Running simulations and everything derived from a run.

Runs are content-addressed: the id is a hash of the effective scenario plus the
routing strategy, so an identical configuration always maps to the same id. That
makes `POST /simulations` idempotent (dragging a slider back returns the previous
run rather than creating a duplicate) and lets snapshots be cached under a key
that cannot go stale.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import orjson

from core.errors import BadRequestError, NotFoundError
from database.redis import CacheRepo
from database.relational_db import (
    ScenarioInterface,
    SimulationRunInterface,
    SimulationRunRow,
    UoW,
    VariantInterface,
    VariantRow,
)
from domain.analysis import (
    ComparedMetric,
    CompareResponse,
    ParameterDiff,
    VariantCreate,
    VariantModel,
)
from domain.scenario import ConfigModel, RoutingStrategyName
from domain.simulation import (
    AvailabilitySample,
    ClientMetricsModel,
    EphemerisResponse,
    EphemerisSample,
    OutageWindowModel,
    RouteModel,
    RouteTimelineResponse,
    RunRequest,
    SatelliteStateModel,
    SimulationSummary,
    SnapshotEdgeModel,
    SnapshotResponse,
)
from engine import RoutingStrategy, active_site_conditions
from engine.export import build_result
from engine.simulate import SimulationResult, ephemeris, simulate, snapshot_at
from service.scenarios.service import check_scenario
from service.simulations.overrides import effective_scenario

logger = logging.getLogger(__name__)


class SimulationService:
    def __init__(
        self,
        *,
        uow: UoW,
        scenarios: ScenarioInterface,
        runs: SimulationRunInterface,
        variants: VariantInterface,
        cache: CacheRepo,
    ) -> None:
        self.uow = uow
        self.scenarios = scenarios
        self.runs = runs
        self.variants = variants
        self.cache = cache

    async def run(self, request: RunRequest) -> SimulationSummary:
        try:
            request.resolved()
        except ValueError as exc:
            raise BadRequestError(str(exc)) from exc

        base = await self._base_scenario(request.scenario_id, request.scenario)
        effective = effective_scenario(base, request.config)
        strategy = RoutingStrategy(request.strategy.value)
        run_id = content_id(effective, strategy)

        existing = await self.runs.get(run_id)
        if existing is not None:
            return SimulationSummary.model_validate(existing.summary)

        # The jury may upload a scenario far larger than the official four, and
        # the write below re-acquires a connection on its own.
        await self.uow.release()
        result = await asyncio.to_thread(simulate, effective, strategy=strategy)
        summary = self._summarise(
            run_id=run_id,
            scenario_id=request.scenario_id,
            label=request.label,
            config=request.config,
            result=result,
        )

        await self.runs.upsert(
            run_id,
            scenario_id=request.scenario_id,
            label=request.label,
            strategy=strategy.value,
            config=request.config.model_dump(mode="json"),
            effective_scenario=effective,
            summary=summary.model_dump(mode="json"),
            worst_availability=summary.worst_availability,
            mean_availability=summary.mean_availability,
            meets_target=summary.meets_target,
            environment_modified=summary.environment_modified,
            compute_ms=summary.compute_ms,
        )
        await self.uow.commit()
        return summary

    async def summary(self, run_id: str) -> SimulationSummary:
        return SimulationSummary.model_validate((await self._require_run(run_id)).summary)

    async def snapshot(self, run_id: str, t_s: int) -> SnapshotResponse:
        """One instant. Cached, because the timeline scrubs back and forth."""
        row = await self._require_run(run_id)
        scenario = row.effective_scenario
        t_s = self._snap_to_grid(scenario, t_s)

        key = f"snap:{run_id}:{t_s}"
        cached = await self.cache.get_json(key)
        if cached is not None:
            return SnapshotResponse.model_validate(cached)

        strategy = RoutingStrategy(row.strategy)
        snap = await asyncio.to_thread(snapshot_at, scenario, t_s, strategy=strategy)

        response = SnapshotResponse(
            t_s=snap.t_s,
            satellites=[_satellite_model(s) for s in snap.satellites],
            edges=[
                SnapshotEdgeModel(
                    source=e.source, target=e.target, distance_km=e.distance_km, type=e.type
                )
                for e in snap.edges
            ],
            routes=[_route_model(r) for r in snap.routes.values()],
            elevation_deg=snap.elevation_deg,
            offline_gateways=sorted(snap.offline_gateways),
            masked_satellites={site: list(ids) for site, ids in snap.masked_satellites.items()},
            active_satellites=sum(1 for s in snap.satellites if s.active),
            total_satellites=len(snap.satellites),
        )
        await self.cache.set_json(key, response.model_dump(mode="json"))
        return response

    async def ephemeris(self, run_id: str, step_s: int | None = None) -> EphemerisResponse:
        row = await self._require_run(run_id)
        scenario = row.effective_scenario
        env = scenario["environment"]
        effective_step = env["step_s"] if step_s is None else step_s

        key = f"eph:{run_id}:{effective_step}"
        cached = await self.cache.get_json(key)
        if cached is not None:
            return EphemerisResponse.model_validate(cached)

        samples = await asyncio.to_thread(ephemeris, scenario, step_s=step_s)
        response = EphemerisResponse(
            step_s=samples[1]["t_s"] - samples[0]["t_s"] if len(samples) > 1 else env["step_s"],
            horizon_s=env["horizon_s"],
            samples=[
                EphemerisSample(
                    t_s=sample["t_s"],
                    satellites=[_satellite_model(s) for s in sample["satellites"]],
                )
                for sample in samples
            ],
        )
        await self.cache.set_json(key, response.model_dump(mode="json"))
        return response

    async def route_timeline(self, run_id: str, client_id: str) -> RouteTimelineResponse:
        row = await self._require_run(run_id)
        result = await self._replay(row)

        if client_id not in result.metrics:
            raise NotFoundError(f"Client {client_id!r} is not part of this scenario")

        return RouteTimelineResponse(
            client_id=client_id,
            step_s=result.step_s,
            routes=[_route_model(result.routes[t_s][client_id]) for t_s in result.time_grid],
        )

    async def availability_series(self, run_id: str) -> list[AvailabilitySample]:
        """Per-instant state for the timeline strip.

        Three states rather than two — a client can have a satellite overhead and
        still have no route, and that distinction is the case's central point.
        """
        row = await self._require_run(run_id)
        key = f"avail:{run_id}"
        cached = await self.cache.get_json(key)
        if cached is not None:
            return [AvailabilitySample.model_validate(item) for item in cached]

        result = await self._replay(row)
        samples = []
        for t_s in result.time_grid:
            state: dict[str, str] = {}
            for client_id, route in result.routes[t_s].items():
                if route.available:
                    state[client_id] = "routed"
                elif route.reason is not None and route.reason.value == "no_visible_satellite":
                    state[client_id] = "no_satellite"
                else:
                    state[client_id] = "visible_no_route"
            samples.append(AvailabilitySample(t_s=t_s, state=state))  # type: ignore[arg-type]

        await self.cache.set_json(key, [s.model_dump(mode="json") for s in samples])
        return samples

    async def export(self, run_id: str) -> dict[str, Any]:
        """The official `cosmo-A-result-1.0` document."""
        row = await self._require_run(run_id)
        result = await self._replay(row)
        return build_result(result)

    async def effective_scenario(self, run_id: str) -> dict[str, Any]:
        """The scenario as actually run — re-importable, so a variant round-trips."""
        return (await self._require_run(run_id)).effective_scenario

    async def save_variant(self, request: VariantCreate) -> VariantModel:
        summary = await self.run(
            RunRequest(
                scenario_id=request.scenario_id,
                scenario=request.scenario,
                config=request.config,
                strategy=request.strategy,
                label=request.name,
            )
        )
        row = await self.variants.create(
            id=f"var_{uuid4().hex[:12]}",
            name=request.name,
            note=request.note,
            run_id=summary.id,
        )
        await self.uow.commit()
        reloaded = await self.variants.get(row.id)
        assert reloaded is not None
        return _variant_model(reloaded)

    async def list_variants(self) -> list[VariantModel]:
        return [_variant_model(row) for row in await self.variants.list()]

    async def delete_variant(self, variant_id: str) -> None:
        if not await self.variants.delete(variant_id):
            raise NotFoundError(f"Variant {variant_id!r} not found")
        await self.uow.commit()

    async def compare(self, variant_ids: list[str]) -> CompareResponse:
        rows = await self.variants.get_many(variant_ids)
        if len(rows) != len(variant_ids):
            missing = set(variant_ids) - {row.id for row in rows}
            raise NotFoundError(f"Unknown variants: {', '.join(sorted(missing))}")

        models = [_variant_model(row) for row in rows]
        summaries = [SimulationSummary.model_validate(row.run.summary) for row in rows]

        return CompareResponse(
            variants=models,
            changed_parameters=_parameter_diff(rows),
            metrics=_metric_rows(summaries),
            per_client_availability=_per_client(summaries),
            recommendation=_recommend(models, summaries),
        )

    async def _base_scenario(
        self, scenario_id: str | None, inline: dict[str, Any] | None
    ) -> dict[str, Any]:
        if scenario_id is not None:
            row = await self.scenarios.get(scenario_id)
            if row is None:
                raise NotFoundError(f"Scenario {scenario_id!r} not found")
            return row.payload
        return check_scenario(inline)

    async def _require_run(self, run_id: str) -> SimulationRunRow:
        row = await self.runs.get(run_id)
        if row is None:
            raise NotFoundError(
                f"Simulation {run_id!r} not found. Runs are transient — re-run the configuration."
            )
        return row

    async def _replay(self, row: SimulationRunRow) -> SimulationResult:
        """Recompute a run to get at its routes.

        Cheaper than storing them: the 2160 route records are ~400 KB per run,
        while regenerating them costs ~0.15 s and keeps the database small enough
        to stay boring.
        """
        return await asyncio.to_thread(
            simulate, row.effective_scenario, strategy=RoutingStrategy(row.strategy)
        )

    def _snap_to_grid(self, scenario: dict[str, Any], t_s: int) -> int:
        env = scenario["environment"]
        if not 0 <= t_s < env["horizon_s"]:
            raise BadRequestError(
                f"t_s must be within [0, {env['horizon_s']}), got {t_s}",
                details={"field": "t_s"},
            )
        return (t_s // env["step_s"]) * env["step_s"]

    def _summarise(
        self,
        *,
        run_id: str,
        scenario_id: str | None,
        label: str | None,
        config: ConfigModel,
        result: SimulationResult,
    ) -> SimulationSummary:
        scenario = result.effective_scenario
        names = {site["id"]: site["name"] for site in scenario["ground_sites"]}
        availabilities = [m.availability for m in result.metrics.values()]
        scenario_mask = float(scenario["environment"]["min_elevation_deg"])
        conditions = active_site_conditions(scenario)

        return SimulationSummary(
            id=run_id,
            scenario_id=scenario_id,
            label=label,
            strategy=RoutingStrategyName(result.strategy.value),
            created_at=datetime.now(UTC).isoformat(),
            target_availability=result.target_availability,
            step_s=result.step_s,
            horizon_s=result.horizon_s,
            steps=len(result.time_grid),
            worst_availability=min(availabilities, default=0.0),
            mean_availability=sum(availabilities) / len(availabilities) if availabilities else 0.0,
            meets_target=all(m.meets_target for m in result.metrics.values()),
            clients=[
                ClientMetricsModel(
                    client_id=m.client_id,
                    name=names.get(m.client_id, m.client_id),
                    visibility=m.visibility,
                    availability=m.availability,
                    meets_target=m.meets_target,
                    max_outage_s=m.max_outage_s,
                    max_bounded_outage_s=m.max_bounded_outage_s,
                    leading_outage_s=m.leading_outage_s,
                    trailing_outage_s=m.trailing_outage_s,
                    avg_hops=m.avg_hops,
                    min_hops=m.min_hops,
                    max_hops=m.max_hops,
                    outage_reasons=m.reason_counts,
                    site_profile=(
                        conditions[m.client_id].profile if m.client_id in conditions else None
                    ),
                    effective_mask_deg=(
                        max(scenario_mask, conditions[m.client_id].peak_mask_deg)
                        if m.client_id in conditions
                        else scenario_mask
                    ),
                    masked_share=m.masked_share,
                    outage_windows=[
                        OutageWindowModel(
                            client_id=w.client_id,
                            start_s=w.start_s,
                            end_s=w.end_s,
                            duration_s=w.duration_s,
                            reason=w.reason.value if w.reason else None,  # type: ignore[arg-type]
                            leading=w.leading,
                            trailing=w.trailing,
                        )
                        for w in m.outage_windows
                    ],
                )
                for m in result.metrics.values()
            ],
            config=config,
            environment_modified=config.touches_environment,
            site_conditions_active=bool(conditions),
            effective_scenario=scenario,
            compute_ms=round(result.duration_s * 1000, 2),
        )


# Bumped whenever the stored summary gains a field, so a run persisted under the
# previous shape is recomputed instead of being served with the field missing.
SUMMARY_VERSION = b"summary-v2"


def content_id(effective_scenario: dict[str, Any], strategy: RoutingStrategy) -> str:
    """Stable id for a configuration: same inputs, same run."""
    blob = orjson.dumps(effective_scenario, option=orjson.OPT_SORT_KEYS)
    digest = hashlib.blake2b(blob, digest_size=10)
    digest.update(strategy.value.encode())
    digest.update(SUMMARY_VERSION)
    return f"sim_{digest.hexdigest()}"


def _satellite_model(state: Any) -> SatelliteStateModel:
    return SatelliteStateModel(
        id=state.id,
        lat_deg=round(state.lat_deg, 5),
        lon_deg=round(state.lon_deg, 5),
        alt_km=round(state.alt_km, 3),
        x_km=round(state.x_km, 3),
        y_km=round(state.y_km, 3),
        z_km=round(state.z_km, 3),
        active=state.active,
    )


def _route_model(route: Any) -> RouteModel:
    return RouteModel(
        client_id=route.client_id,
        available=route.available,
        path=list(route.path),
        hops=route.hops,
        distance_km=round(route.distance_km, 3) if route.distance_km is not None else None,
        reason=route.reason.value if route.reason else None,
        gateway_id=route.gateway_id,
    )


def _variant_model(row: VariantRow) -> VariantModel:
    summary = SimulationSummary.model_validate(row.run.summary)
    return VariantModel(
        id=row.id,
        name=row.name,
        note=row.note,
        scenario_id=row.run.scenario_id,
        scenario_title=summary.effective_scenario["meta"]["title"],
        config=summary.config,
        strategy=summary.strategy,
        created_at=row.created_at.isoformat(),
        worst_availability=summary.worst_availability,
        mean_availability=summary.mean_availability,
        meets_target=summary.meets_target,
        max_bounded_outage_s=max((c.max_bounded_outage_s for c in summary.clients), default=0),
        availability_by_client={c.client_id: c.availability for c in summary.clients},
        environment_modified=summary.environment_modified,
    )


_PLANE_LABEL = {"raan_deg": "RAAN", "phase_deg": "Phase"}


def _parameter_diff(rows: list[VariantRow]) -> list[ParameterDiff]:
    """What actually differs between the variants — the case requires this explicitly."""
    scenarios = [row.run.effective_scenario for row in rows]
    diffs: list[ParameterDiff] = []

    stages = [s["design"]["launch_stage"] for s in scenarios]
    if len(set(stages)) > 1:
        diffs.append(
            ParameterDiff(path="design.launch_stage", label="Launch stage", values=list(stages))
        )

    plane_ids = sorted({p["id"] for s in scenarios for p in s["design"]["planes"]})
    for plane_id in plane_ids:
        for attribute, label in _PLANE_LABEL.items():
            values = [
                next((p[attribute] for p in s["design"]["planes"] if p["id"] == plane_id), None)
                for s in scenarios
            ]
            if len({v for v in values if v is not None}) > 1:
                diffs.append(
                    ParameterDiff(
                        path=f"design.planes[{plane_id}].{attribute}",
                        label=f"{plane_id} {label}",
                        values=values,
                    )
                )

    for key, label in (
        ("isl_range_km", "ISL range, km"),
        ("min_elevation_deg", "Min elevation, °"),
        ("altitude_km", "Altitude, km"),
        ("inclination_deg", "Inclination, °"),
    ):
        values = [s["environment"][key] for s in scenarios]
        if len(set(values)) > 1:
            diffs.append(ParameterDiff(path=f"environment.{key}", label=label, values=values))

    counts = [len(s["failures"]) for s in scenarios]
    if len(set(counts)) > 1:
        diffs.append(ParameterDiff(path="failures", label="Failure windows", values=list(counts)))

    site_ids = sorted({site["id"] for s in scenarios for site in s["ground_sites"]})
    for site_id in site_ids:
        values = [_site_conditions_label(s, site_id) for s in scenarios]
        if len(set(values)) > 1:
            diffs.append(
                ParameterDiff(
                    path=f"ground_sites[{site_id}].site_conditions",
                    label=f"{site_id} surroundings",
                    values=values,
                )
            )

    return diffs


def _site_conditions_label(scenario: dict[str, Any], site_id: str) -> str:
    """One readable token per site: the profile and the horizon it raises to."""
    conditions = active_site_conditions(scenario).get(site_id)
    if conditions is None:
        return "open"
    mask = max(float(scenario["environment"]["min_elevation_deg"]), conditions.peak_mask_deg)
    label = f"{conditions.profile} {mask:g}°"
    if conditions.azimuth_mask:
        label += " (az profile)"
    if conditions.altitude_m:
        label += f" +{conditions.altitude_m:g} m"
    return label


def _metric_rows(summaries: list[SimulationSummary]) -> list[ComparedMetric]:
    return [
        ComparedMetric(
            key="worst_availability",
            label="Worst-client availability",
            unit="fraction",
            values=[s.worst_availability for s in summaries],
            higher_is_better=True,
        ),
        ComparedMetric(
            key="mean_availability",
            label="Mean availability",
            unit="fraction",
            values=[s.mean_availability for s in summaries],
            higher_is_better=True,
        ),
        ComparedMetric(
            key="max_bounded_outage_s",
            label="Longest outage",
            unit="seconds",
            values=[max((c.max_bounded_outage_s for c in s.clients), default=0) for s in summaries],
            higher_is_better=False,
        ),
        ComparedMetric(
            key="clients_meeting_target",
            label="Clients meeting target",
            unit="count",
            values=[sum(1 for c in s.clients if c.meets_target) for s in summaries],
            higher_is_better=True,
        ),
        ComparedMetric(
            key="avg_hops",
            label="Mean route length",
            unit="hops",
            values=[_mean_hops(s) for s in summaries],
            higher_is_better=False,
        ),
    ]


def _mean_hops(summary: SimulationSummary) -> float | None:
    hops = [c.avg_hops for c in summary.clients if c.avg_hops is not None]
    return round(sum(hops) / len(hops), 3) if hops else None


def _per_client(summaries: list[SimulationSummary]) -> dict[str, list[float]]:
    client_ids = sorted({c.client_id for s in summaries for c in s.clients})
    return {
        client_id: [
            next((c.availability for c in s.clients if c.client_id == client_id), 0.0)
            for s in summaries
        ]
        for client_id in client_ids
    }


def _recommend(variants: list[VariantModel], summaries: list[SimulationSummary]) -> str:
    """A sentence the engineer can put in a report, not a bare winner flag.

    Ranked on worst-client availability because that is what the target is
    judged on; ties fall through to the longest outage.
    """
    target = summaries[0].target_availability
    ranked = sorted(
        zip(variants, summaries, strict=True),
        key=lambda pair: (
            pair[1].worst_availability,
            -max((c.max_bounded_outage_s for c in pair[1].clients), default=0),
        ),
        reverse=True,
    )
    best_variant, best_summary = ranked[0]
    worst_pct = best_variant.worst_availability * 100
    target_pct = target * 100

    if any(s.environment_modified for s in summaries):
        caveat = (
            " Note that these runs do not share one environment — altitude, ISL range or the "
            "elevation mask differ — so this is a sensitivity comparison, not a design comparison."
        )
    else:
        caveat = ""

    if best_summary.meets_target:
        return (
            f"{best_variant.name} is the strongest option: every client stays at or above the "
            f"{target_pct:.0f}% target, with the worst-served one at {worst_pct:.1f}%.{caveat}"
        )

    failing = [c.client_id for c in best_summary.clients if not c.meets_target]
    return (
        f"{best_variant.name} is the best of the compared options at {worst_pct:.1f}% for the "
        f"worst-served client, but it still misses the {target_pct:.0f}% target for "
        f"{', '.join(failing)}. Reaching the target needs an architectural change — more "
        f"satellites in the staged batches or a longer ISL range — not a different phasing."
        f"{caveat}"
    )
