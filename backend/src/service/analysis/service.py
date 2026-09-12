from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from core.config import get_settings
from core.errors import BadRequestError, NotFoundError
from database.redis import CacheRepo
from database.relational_db import ScenarioInterface, UoW
from domain.analysis import (
    GatewayDependencyModel,
    JobStatusModel,
    OptimizeRequest,
    OptimizeResult,
    PlaneBoundsModel,
    ResilienceRequest,
    ResilienceResponse,
    SatelliteImpactModel,
    SensitivityPointModel,
    SensitivityRequest,
    SensitivityResponse,
)
from domain.analysis.schemas import CandidateModel
from domain.scenario import ConfigModel
from engine import RoutingStrategy
from engine.analysis import analyse_gateway_dependency, analyse_resilience
from engine.optimizer import (
    Candidate,
    Objective,
    PlaneBounds,
    SearchCancelled,
    SearchMethod,
    optimize,
    planned_runs,
    sweep_environment,
)
from service.analysis.jobs import Job, JobCancelled, JobRegistry
from service.scenarios.service import check_scenario
from service.simulations.overrides import effective_scenario

logger = logging.getLogger(__name__)

_analysis_slots: asyncio.Semaphore | None = None


def analysis_gate() -> asyncio.Semaphore:
    global _analysis_slots
    if _analysis_slots is None:
        _analysis_slots = asyncio.Semaphore(max(1, get_settings().MAX_CONCURRENT_ANALYSES))
    return _analysis_slots


def reset_analysis_gate() -> None:
    global _analysis_slots
    _analysis_slots = None


class AnalysisService:
    def __init__(
        self,
        *,
        uow: UoW,
        scenarios: ScenarioInterface,
        cache: CacheRepo,
        jobs: JobRegistry,
    ) -> None:
        self.uow = uow
        self.scenarios = scenarios
        self.cache = cache
        self.jobs = jobs

    async def resilience(self, request: ResilienceRequest) -> ResilienceResponse:
        scenario = await self._effective(request.scenario_id, request.scenario, request.config)
        strategy = RoutingStrategy(request.strategy.value)
        settings = get_settings()

        await self.uow.release()

        async with analysis_gate():
            started = time.perf_counter()
            report, dependency = await asyncio.gather(
                asyncio.to_thread(
                    analyse_resilience,
                    scenario,
                    strategy=strategy,
                    satellites=request.satellite_ids,
                    max_workers=settings.ANALYSIS_MAX_WORKERS,
                ),
                asyncio.to_thread(analyse_gateway_dependency, scenario, strategy=strategy),
            )
            elapsed = (time.perf_counter() - started) * 1000

        plane_of = {s["id"]: s["plane_id"] for s in scenario["design"]["satellites"]}
        impacts = sorted(report.impacts, key=lambda i: -i.worst_availability_drop)

        return ResilienceResponse(
            baseline_worst_availability=report.baseline_worst_availability,
            baseline_mean_availability=report.baseline_mean_availability,
            target_availability=report.target_availability,
            impacts=[
                SatelliteImpactModel(
                    satellite_id=i.satellite_id,
                    plane_id=plane_of.get(i.satellite_id, ""),
                    worst_availability_drop=round(i.worst_availability_drop, 6),
                    mean_availability_drop=round(i.mean_availability_drop, 6),
                    per_client_drop={k: round(v, 6) for k, v in i.per_client_drop.items()},
                    breaks_target=i.breaks_target,
                    criticality=i.criticality,
                    per_client_outage_growth_s=dict(i.per_client_outage_growth_s),
                )
                for i in impacts
            ],
            critical_satellite_ids=[i.satellite_id for i in report.critical],
            gateway_dependency=[
                GatewayDependencyModel(
                    gateway_id=d.gateway_id,
                    serving_satellites=list(d.serving_satellites),
                    busiest_satellite=d.busiest_satellite,
                    busiest_share=d.busiest_share,
                    contact_availability=round(d.contact_availability, 6),
                    routed_share_by_client={
                        k: round(v, 6) for k, v in d.routed_share_by_client.items()
                    },
                )
                for d in dependency
            ],
            compute_ms=round(elapsed, 2),
        )

    async def sensitivity(self, request: SensitivityRequest) -> SensitivityResponse:
        scenario = await self._effective(request.scenario_id, request.scenario, request.config)
        strategy = RoutingStrategy(request.strategy.value)
        settings = get_settings()

        await self.uow.release()

        async with analysis_gate():
            started = time.perf_counter()
            points = await asyncio.to_thread(
                sweep_environment,
                scenario,
                parameter=request.parameter,
                values=sorted(request.values),
                strategy=strategy,
                max_workers=settings.ANALYSIS_MAX_WORKERS,
            )
            elapsed = (time.perf_counter() - started) * 1000

        return SensitivityResponse(
            parameter=request.parameter,
            points=[
                SensitivityPointModel(
                    value=p.value,
                    worst_availability=round(p.worst_availability, 6),
                    per_client={k: round(v, 6) for k, v in p.per_client.items()},
                    meets_target=p.meets_target,
                )
                for p in points
            ],
            threshold=next((p.value for p in points if p.meets_target), None),
            compute_ms=round(elapsed, 2),
        )

    async def start_optimization(self, request: OptimizeRequest) -> JobStatusModel:
        scenario = await self._effective(request.scenario_id, request.scenario, request.config)
        strategy = RoutingStrategy(request.strategy.value)
        bounds = _bounds(request.bounds, scenario)
        objective = Objective(request.objective)

        if all(b.locked for b in bounds):
            raise BadRequestError(
                "Every plane is locked, so there is nothing to search. "
                "Unlock at least one RAAN or phase range."
            )

        settings = get_settings()
        method = SearchMethod(request.method)

        # The exhaustive grid is refused outright rather than merely capped: at
        # six free angles it is four thousand full simulations, half an hour of
        # both production cores, and it measured worse than the descent anyway.
        if method is SearchMethod.GRID:
            raise BadRequestError(
                "The exhaustive grid search is disabled on this service: it takes "
                "about half an hour and scores worse than coordinate descent. "
                "Use method 'coordinate_descent'."
            )

        free_axes = sum((b.raan_deg is not None) + (b.phase_deg is not None) for b in bounds)
        runs = planned_runs(
            free_axes,
            method,
            request.coarse_steps,
            request.axis_steps,
            request.passes,
            request.starts,
            request.refine_rounds,
        )
        if runs > settings.OPTIMIZER_MAX_RUNS:
            raise BadRequestError(
                f"This search would evaluate {runs} configurations; the limit is "
                f"{settings.OPTIMIZER_MAX_RUNS}. Lock some angles or use fewer passes or starts."
            )

        async def work(job: Job) -> OptimizeResult:
            async with analysis_gate():
                # Stopped while it was still waiting for a slot.
                if job.stop.is_set():
                    raise JobCancelled
                try:
                    result = await asyncio.to_thread(
                        optimize,
                    scenario,
                    bounds=bounds,
                    strategy=strategy,
                    objective=objective,
                        method=method,
                        coarse_steps=request.coarse_steps,
                        refine_rounds=request.refine_rounds,
                        axis_steps=request.axis_steps,
                        passes=request.passes,
                        starts=request.starts,
                        max_workers=settings.OPTIMIZER_MAX_WORKERS,
                        progress=job.note_progress,
                        cancelled=job.stop.is_set,
                    )
                except SearchCancelled as exc:
                    raise JobCancelled from exc
            return _optimize_result(result, scenario)

        return _job_model(self.jobs.submit("optimize", work))

    def cancel_job(self, job_id: str) -> JobStatusModel:
        job = self.jobs.cancel(job_id)
        if job is None:
            raise NotFoundError(f"Job {job_id!r} not found")
        return _job_model(job)

    def job(self, job_id: str) -> JobStatusModel:
        job = self.jobs.get(job_id)
        if job is None:
            raise NotFoundError(f"Job {job_id!r} not found")
        return _job_model(job)

    def job_result(self, job_id: str) -> OptimizeResult:
        job = self.jobs.get(job_id)
        if job is None:
            raise NotFoundError(f"Job {job_id!r} not found")
        if job.status == "failed":
            raise BadRequestError(job.error or "Job failed")
        if job.status == "cancelled":
            raise BadRequestError(f"Job {job_id!r} was cancelled")
        if job.status != "done":
            raise BadRequestError(f"Job {job_id!r} is still {job.status}")
        return job.result

    async def _effective(
        self,
        scenario_id: str | None,
        inline: dict[str, Any] | None,
        config: ConfigModel,
    ) -> dict[str, Any]:
        if (scenario_id is None) == (inline is None):
            raise BadRequestError("Provide exactly one of scenario_id or scenario")

        if scenario_id is not None:
            row = await self.scenarios.get(scenario_id)
            if row is None:
                raise NotFoundError(f"Scenario {scenario_id!r} not found")
            base = row.payload
        else:
            base = check_scenario(inline)

        return effective_scenario(base, config)


def _bounds(models: list[PlaneBoundsModel], scenario: dict[str, Any]) -> list[PlaneBounds]:
    known = {p["id"] for p in scenario["design"]["planes"]}
    for model in models:
        if model.plane_id not in known:
            raise BadRequestError(f"Unknown plane {model.plane_id!r}", details={"field": "bounds"})
    return [
        PlaneBounds(
            plane_id=m.plane_id,
            raan_deg=tuple(m.raan_deg) if m.raan_deg else None,
            phase_deg=tuple(m.phase_deg) if m.phase_deg else None,
        )
        for m in models
    ]


def _candidate(candidate: Candidate) -> CandidateModel:
    return CandidateModel(
        planes={
            pid: {"raan_deg": p.raan_deg, "phase_deg": p.phase_deg}
            for pid, p in candidate.planes.items()
        },
        worst_availability=round(candidate.worst_availability, 6),
        mean_availability=round(candidate.mean_availability, 6),
        worst_outage_s=candidate.worst_outage_s,
        mean_hops=round(candidate.mean_hops, 4),
    )


def _optimize_result(result: Any, scenario: dict[str, Any]) -> OptimizeResult:
    target = scenario["environment"]["target_availability"]
    return OptimizeResult(
        baseline=_candidate(result.baseline),
        best=_candidate(result.best),
        objective=result.objective.value,
        improved=result.improved,
        explored=result.explored,
        changed_planes={
            pid: {"raan_deg": p.raan_deg, "phase_deg": p.phase_deg}
            for pid, p in result.changed_planes.items()
        },
        verdict=_verdict(result, target),
    )


def _verdict(result: Any, target: float) -> str:
    before = result.baseline.worst_availability
    after = result.best.worst_availability
    target_pct = target * 100

    if not result.improved:
        if before >= target:
            return (
                f"The current configuration is already a local optimum at {before * 100:.1f}% for "
                f"the worst-served client, above the {target_pct:.0f}% target. The search explored "
                f"{result.explored} configurations without finding a better one."
            )
        return (
            f"No phasing or RAAN change improves on {before * 100:.1f}% for the worst-served "
            f"client across {result.explored} configurations explored. The {target_pct:.0f}% "
            f"target is not reachable by re-orienting the existing planes — it needs an "
            f"architectural change: more satellites in the deployed batches, a longer "
            f"inter-satellite link range, or an additional gateway."
        )

    gain = (after - before) * 100
    changes = ", ".join(
        f"{pid} "
        + " ".join(
            f"{name.split('_')[0].upper()}→{value:.1f}°"
            for name, value in (("raan_deg", p.raan_deg), ("phase_deg", p.phase_deg))
            if value is not None
        )
        for pid, p in result.changed_planes.items()
    )
    verdict = (
        f"Worst-client availability improves from {before * 100:.1f}% to {after * 100:.1f}% "
        f"({gain:+.1f} points) by changing {changes or 'plane orientation'}."
    )
    if after < target:
        verdict += (
            f" This still falls short of the {target_pct:.0f}% target, so phasing alone is not "
            f"enough for this configuration."
        )
    return verdict


def _job_model(job: Job) -> JobStatusModel:
    return JobStatusModel(
        id=job.id,
        kind=job.kind,
        status=job.status,
        progress=round(job.progress, 4),
        explored=job.explored,
        total=job.total,
        error=job.error,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )
