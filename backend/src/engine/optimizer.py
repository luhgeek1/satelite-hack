from __future__ import annotations

import itertools
import random
from collections.abc import Callable, Iterable, Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from .metrics import mean_availability, worst_availability
from .parallel import pin_worker_threads, resolve_workers
from .routing import RoutingStrategy
from .scenario import ConfigOverride, PlaneOverride, apply_override
from .simulate import simulate


class Objective(StrEnum):
    WORST_FIRST = "worst_first"
    MEAN_FIRST = "mean_first"


class SearchMethod(StrEnum):
    COORDINATE_DESCENT = "coordinate_descent"
    GRID = "grid"


@dataclass(frozen=True, slots=True)
class PlaneBounds:
    plane_id: str
    raan_deg: tuple[float, float] | None = None
    phase_deg: tuple[float, float] | None = None

    @property
    def locked(self) -> bool:
        return self.raan_deg is None and self.phase_deg is None


@dataclass(frozen=True, slots=True)
class Candidate:
    planes: dict[str, PlaneOverride]
    worst_availability: float
    mean_availability: float
    worst_outage_s: int
    mean_hops: float

    def score(self, objective: Objective = None) -> tuple[float, float, int, float]:
        objective = objective or Objective.WORST_FIRST
        leading, secondary = (
            (self.worst_availability, self.mean_availability)
            if objective is Objective.WORST_FIRST
            else (self.mean_availability, self.worst_availability)
        )
        return (leading, secondary, -self.worst_outage_s, -self.mean_hops)


@dataclass(slots=True)
class OptimizationResult:
    baseline: Candidate
    best: Candidate
    explored: int
    improved: bool
    objective: Objective = Objective.WORST_FIRST
    changed_planes: dict[str, PlaneOverride] = field(default_factory=dict)


class SearchCancelled(Exception):
    """The caller withdrew the search before it finished."""


def optimize(
    scenario: dict[str, Any],
    *,
    bounds: Sequence[PlaneBounds],
    strategy: RoutingStrategy = RoutingStrategy.MIN_HOPS,
    objective: Objective = Objective.WORST_FIRST,
    method: SearchMethod = SearchMethod.COORDINATE_DESCENT,
    coarse_steps: int = 6,
    refine_rounds: int = 2,
    axis_steps: int = 12,
    passes: int = 3,
    starts: int = 3,
    max_workers: int | None = None,
    progress: Callable[[int, int], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
) -> OptimizationResult:
    _install_scenario(scenario)
    baseline = _evaluate(({}, strategy))
    free = [b for b in bounds if not b.locked]

    if not free:
        return OptimizationResult(
            baseline=baseline, best=baseline, explored=1, improved=False, objective=objective
        )

    defaults = {
        plane["id"]: PlaneOverride(plane["raan_deg"], plane["phase_deg"])
        for plane in scenario["design"]["planes"]
    }

    budget = _Budget(
        planned=planned_runs(
            len(_axes(free)), method, coarse_steps, axis_steps, passes, starts, refine_rounds
        ),
        progress=progress,
        cancelled=cancelled,
    )

    with _Fanout(scenario, max_workers) as fanout:
        if method is SearchMethod.GRID:
            grid = list(_coarse_grid(free, coarse_steps))
            best = _search(fanout, grid, strategy, objective, budget)
        else:
            best = _descend(
                fanout, free, defaults, strategy, objective, axis_steps, passes, starts, budget
            )

        if best.score(objective) < baseline.score(objective):
            best = baseline

        for round_index in range(refine_rounds):
            neighbourhood = list(
                _refine_grid(free, best.planes, defaults, coarse_steps, round_index)
            )
            if not neighbourhood:
                break
            candidate = _search(fanout, neighbourhood, strategy, objective, budget)
            if candidate.score(objective) > best.score(objective):
                best = candidate

    explored = budget.done

    changed = {
        plane_id: override
        for plane_id, override in best.planes.items()
        if _differs(scenario, plane_id, override)
    }

    return OptimizationResult(
        baseline=baseline,
        best=best,
        explored=explored + 1,
        improved=best.score(objective) > baseline.score(objective),
        objective=objective,
        changed_planes=changed,
    )


@dataclass(slots=True)
class _Budget:
    planned: int
    progress: Callable[[int, int], None] | None = None
    cancelled: Callable[[], bool] | None = None
    done: int = 0

    def advance(self, count: int = 1) -> None:
        self.done += count
        if self.progress:
            self.progress(min(self.done, self.planned), self.planned)
        # Checked here because this is the one place every method passes through
        # after each configuration, so no search can run on past a withdrawal.
        if self.cancelled is not None and self.cancelled():
            raise SearchCancelled


def _axes(free: Sequence[PlaneBounds]) -> list[tuple[str, str, tuple[float, float]]]:
    return [
        (bound.plane_id, attribute, span)
        for bound in free
        for attribute, span in (("raan_deg", bound.raan_deg), ("phase_deg", bound.phase_deg))
        if span is not None
    ]


def planned_runs(
    axis_count: int,
    method: SearchMethod,
    coarse_steps: int,
    axis_steps: int,
    passes: int,
    starts: int,
    refine_rounds: int = 0,
) -> int:
    if axis_count == 0:
        return 1

    refinement = refine_rounds * 2 * axis_count

    if method is SearchMethod.GRID:
        return coarse_steps**axis_count + refinement + 1

    # Each start pays for its own opening evaluation before the sweeps begin.
    return starts * (1 + passes * axis_count * axis_steps) + refinement + 1


def _descend(
    fanout: _Fanout,
    free: Sequence[PlaneBounds],
    defaults: dict[str, PlaneOverride],
    strategy: RoutingStrategy,
    objective: Objective,
    axis_steps: int,
    passes: int,
    starts: int,
    budget: _Budget,
) -> Candidate:
    axes = _axes(free)
    rng = random.Random(20260101)
    best: Candidate | None = None

    for start_index in range(max(1, starts)):
        incumbent = (
            {}
            if start_index == 0
            else {
                plane_id: PlaneOverride(
                    raan_deg=value if attribute == "raan_deg" else None,
                    phase_deg=value if attribute == "phase_deg" else None,
                )
                for plane_id, attribute, value in _random_point(axes, rng)
            }
        )
        current = _search(fanout, [incumbent], strategy, objective, budget)

        for _ in range(max(1, passes)):
            moved = False

            for plane_id, attribute, span in axes:
                sweep = [
                    _with_axis(current.planes, defaults, plane_id, attribute, value)
                    for value in _linspace(span, axis_steps)
                ]
                candidate = _search(fanout, sweep, strategy, objective, budget)
                if candidate.score(objective) > current.score(objective):
                    current = candidate
                    moved = True

            if not moved:
                break

        if best is None or current.score(objective) > best.score(objective):
            best = current

    assert best is not None
    return best


def _random_point(
    axes: Sequence[tuple[str, str, tuple[float, float]]],
    rng: random.Random,
) -> list[tuple[str, str, float]]:
    return [
        (plane_id, attribute, round(rng.uniform(*span), 4)) for plane_id, attribute, span in axes
    ]


def _with_axis(
    planes: dict[str, PlaneOverride],
    defaults: dict[str, PlaneOverride],
    plane_id: str,
    attribute: str,
    value: float,
) -> dict[str, PlaneOverride]:
    updated = dict(planes)
    current = updated.get(plane_id, PlaneOverride())
    fallback = defaults.get(plane_id, PlaneOverride())

    raan = current.raan_deg if current.raan_deg is not None else fallback.raan_deg
    phase = current.phase_deg if current.phase_deg is not None else fallback.phase_deg

    updated[plane_id] = PlaneOverride(
        raan_deg=value if attribute == "raan_deg" else raan,
        phase_deg=value if attribute == "phase_deg" else phase,
    )
    return updated


class _Fanout:
    def __init__(self, scenario: dict[str, Any], max_workers: int | None) -> None:
        self._workers = resolve_workers(max_workers)
        self._scenario = scenario
        self._pool: ProcessPoolExecutor | None = None

    def __enter__(self) -> _Fanout:
        _install_scenario(self._scenario)
        if self._workers > 1:
            self._pool = ProcessPoolExecutor(
                max_workers=self._workers,
                initializer=_install_scenario,
                initargs=(self._scenario,),
            )
        return self

    def __exit__(self, exc_type: type[BaseException] | None, *_exc: object) -> None:
        if self._pool is not None:
            # Leaving on an exception — a cancellation above all — must not sit
            # through the rest of the queue: pending chunks are dropped and only
            # the ones already on a core finish.
            if exc_type is None:
                self._pool.shutdown()
            else:
                self._pool.shutdown(wait=False, cancel_futures=True)
            self._pool = None

    def map(self, payloads: list[tuple[dict[str, PlaneOverride], RoutingStrategy]]):
        # A single candidate is not worth a round trip through the pool.
        if self._pool is None or len(payloads) == 1:
            return (_evaluate(payload) for payload in payloads)
        return self._pool.map(_evaluate, payloads, chunksize=8)


def _search(
    fanout: _Fanout,
    candidates: list[dict[str, PlaneOverride]],
    strategy: RoutingStrategy,
    objective: Objective,
    budget: _Budget,
) -> Candidate:
    evaluated = []
    for candidate in fanout.map([(planes, strategy) for planes in candidates]):
        evaluated.append(candidate)
        budget.advance()

    return max(evaluated, key=lambda c: c.score(objective))


_WORKER_SCENARIO: dict[str, Any] | None = None


def _install_scenario(scenario: dict[str, Any]) -> None:
    global _WORKER_SCENARIO
    pin_worker_threads()
    _WORKER_SCENARIO = scenario


def _evaluate(payload: tuple[dict[str, PlaneOverride], RoutingStrategy]) -> Candidate:
    planes, strategy = payload
    scenario = _WORKER_SCENARIO
    if scenario is None:
        raise RuntimeError("Worker scenario was never installed")
    effective = apply_override(scenario, ConfigOverride(planes=planes)) if planes else scenario
    result = simulate(effective, strategy=strategy)

    hops = [m.avg_hops for m in result.metrics.values() if m.avg_hops is not None]
    return Candidate(
        planes=dict(planes),
        worst_availability=worst_availability(result.metrics),
        mean_availability=mean_availability(result.metrics),
        worst_outage_s=max((m.max_bounded_outage_s for m in result.metrics.values()), default=0),
        mean_hops=(sum(hops) / len(hops)) if hops else 0.0,
    )


def _coarse_grid(
    free: Sequence[PlaneBounds],
    steps: int,
) -> Iterable[dict[str, PlaneOverride]]:
    axes: list[list[tuple[str, str, float]]] = []
    for bound in free:
        for attribute, span in (("raan_deg", bound.raan_deg), ("phase_deg", bound.phase_deg)):
            if span is None:
                continue
            axes.append([(bound.plane_id, attribute, value) for value in _linspace(span, steps)])

    for combination in itertools.product(*axes):
        yield _to_planes(combination)


def _refine_grid(
    free: Sequence[PlaneBounds],
    around: dict[str, PlaneOverride],
    defaults: dict[str, PlaneOverride],
    steps: int,
    round_index: int,
) -> Iterable[dict[str, PlaneOverride]]:
    shrink = 2 ** (round_index + 1)

    for bound in free:
        current = around.get(bound.plane_id, PlaneOverride())
        fallback = defaults.get(bound.plane_id, PlaneOverride())
        for attribute, span in (("raan_deg", bound.raan_deg), ("phase_deg", bound.phase_deg)):
            if span is None:
                continue
            centre = getattr(current, attribute)
            if centre is None:
                centre = getattr(fallback, attribute)
            if centre is None:
                continue
            width = (span[1] - span[0]) / (steps * shrink)
            for offset in (-width, width):
                value = min(span[1], max(span[0], centre + offset))
                planes = {pid: PlaneOverride(o.raan_deg, o.phase_deg) for pid, o in around.items()}
                existing = planes.get(bound.plane_id, PlaneOverride())
                planes[bound.plane_id] = PlaneOverride(
                    raan_deg=value if attribute == "raan_deg" else existing.raan_deg,
                    phase_deg=value if attribute == "phase_deg" else existing.phase_deg,
                )
                yield planes


def _to_planes(combination: Sequence[tuple[str, str, float]]) -> dict[str, PlaneOverride]:
    collected: dict[str, dict[str, float]] = {}
    for plane_id, attribute, value in combination:
        collected.setdefault(plane_id, {})[attribute] = value
    return {pid: PlaneOverride(**values) for pid, values in collected.items()}


def _linspace(span: tuple[float, float], steps: int) -> list[float]:
    low, high = span
    if steps <= 1 or high <= low:
        return [low]
    stride = (high - low) / steps  # half-open: 360 and 0 are the same angle
    return [round(low + stride * i, 4) for i in range(steps)]


def _differs(scenario: dict[str, Any], plane_id: str, override: PlaneOverride) -> bool:
    plane = next((p for p in scenario["design"]["planes"] if p["id"] == plane_id), None)
    if plane is None:
        return False
    for attribute in ("raan_deg", "phase_deg"):
        value = getattr(override, attribute)
        if value is not None and abs(value - plane[attribute]) > 1e-9:
            return True
    return False


@dataclass(frozen=True, slots=True)
class SensitivityPoint:
    value: float
    worst_availability: float
    per_client: dict[str, float]
    meets_target: bool


def sweep_environment(
    scenario: dict[str, Any],
    *,
    parameter: str,
    values: Sequence[float],
    strategy: RoutingStrategy = RoutingStrategy.MIN_HOPS,
    max_workers: int | None = None,
) -> list[SensitivityPoint]:
    payloads = [(scenario, parameter, float(value), strategy) for value in values]
    workers = resolve_workers(max_workers)

    if workers == 1:
        points = [_sweep_one(p) for p in payloads]
    else:
        with ProcessPoolExecutor(max_workers=workers, initializer=pin_worker_threads) as pool:
            points = list(pool.map(_sweep_one, payloads, chunksize=2))

    return points


def _sweep_one(
    payload: tuple[dict[str, Any], str, float, RoutingStrategy],
) -> SensitivityPoint:
    scenario, parameter, value, strategy = payload
    override = ConfigOverride(**{parameter: value})
    result = simulate(apply_override(scenario, override), strategy=strategy)
    worst = worst_availability(result.metrics)
    return SensitivityPoint(
        value=value,
        worst_availability=worst,
        per_client={cid: m.availability for cid, m in result.metrics.items()},
        meets_target=worst >= scenario["environment"]["target_availability"],
    )
