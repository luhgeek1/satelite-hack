"""Automatic configuration search.

The engineer stays in charge: any plane parameter can be locked, and the search
only moves what is left free. That is not a nicety — real constellation designs
carry constraints this tool cannot see (launch windows, regulatory slots,
agreements already signed), so a recommendation that ignores them is worthless.

Two objectives are offered because the organisers and the case brief point
different ways, and the difference is real. The case states the target "не менее
90% для каждого наземного пункта" — per client — which argues for maximising the
*worst* client. At the Q&A the organisers suggested an automatic recommendation
could rank on the *mean* across clients. `WORST_FIRST` is the default since it
matches the written target and cannot hide a village that fails; `MEAN_FIRST`
is one field away for when the average is what the user wants to trade on.

Either way the objective is lexicographic rather than a weighted sum: a weighting
between availability, outage length and hop count would invent an exchange rate
nobody asked for, and would quietly let a long outage buy a rounding error of
availability.
"""

from __future__ import annotations

import itertools
from collections.abc import Callable, Iterable, Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from .metrics import mean_availability, worst_availability
from .routing import RoutingStrategy
from .scenario import ConfigOverride, PlaneOverride, apply_override
from .simulate import simulate


class Objective(StrEnum):
    """Which client aggregate leads the ranking."""

    WORST_FIRST = "worst_first"
    MEAN_FIRST = "mean_first"


@dataclass(frozen=True, slots=True)
class PlaneBounds:
    """Search space for one plane. `None` on a field means "locked, do not touch"."""

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
        """Lexicographic key, higher-is-better after sign flips."""
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


def optimize(
    scenario: dict[str, Any],
    *,
    bounds: Sequence[PlaneBounds],
    strategy: RoutingStrategy = RoutingStrategy.MIN_HOPS,
    objective: Objective = Objective.WORST_FIRST,
    coarse_steps: int = 6,
    refine_rounds: int = 2,
    max_workers: int | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> OptimizationResult:
    """Coarse grid, then local refinement around the best point.

    A full grid over three planes x two angles is far too large to enumerate, and
    the objective is smooth enough in RAAN/phase that hill-climbing from the best
    coarse point lands in the same place for a fraction of the runs.
    """
    baseline = _evaluate((scenario, {}, strategy))
    free = [b for b in bounds if not b.locked]

    if not free:
        return OptimizationResult(
            baseline=baseline, best=baseline, explored=1, improved=False, objective=objective
        )

    grid = list(_coarse_grid(free, coarse_steps))
    best, explored = _search(
        scenario, grid, strategy, objective, max_workers, progress, 0, len(grid)
    )

    if best.score(objective) < baseline.score(objective):
        best = baseline

    for round_index in range(refine_rounds):
        neighbourhood = list(_refine_grid(free, best.planes, coarse_steps, round_index))
        if not neighbourhood:
            break
        candidate, count = _search(
            scenario,
            neighbourhood,
            strategy,
            objective,
            max_workers,
            progress,
            explored,
            explored + len(neighbourhood),
        )
        explored += count
        if candidate.score(objective) > best.score(objective):
            best = candidate

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


def _search(
    scenario: dict[str, Any],
    candidates: list[dict[str, PlaneOverride]],
    strategy: RoutingStrategy,
    objective: Objective,
    max_workers: int | None,
    progress: Callable[[int, int], None] | None,
    done_before: int,
    total: int,
) -> tuple[Candidate, int]:
    payloads = [(scenario, planes, strategy) for planes in candidates]

    if max_workers == 1:
        evaluated = []
        for index, payload in enumerate(payloads, start=1):
            evaluated.append(_evaluate(payload))
            if progress:
                progress(done_before + index, total)
    else:
        with ProcessPoolExecutor(max_workers=max_workers) as pool:
            evaluated = []
            for index, candidate in enumerate(pool.map(_evaluate, payloads, chunksize=4), start=1):
                evaluated.append(candidate)
                if progress:
                    progress(done_before + index, total)

    return max(evaluated, key=lambda c: c.score(objective)), len(evaluated)


def _evaluate(
    payload: tuple[dict[str, Any], dict[str, PlaneOverride], RoutingStrategy],
) -> Candidate:
    """Score one configuration. Module-level so the process pool can pickle it."""
    scenario, planes, strategy = payload
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
    steps: int,
    round_index: int,
) -> Iterable[dict[str, PlaneOverride]]:
    """One axis at a time around the incumbent — cheap and good enough here."""
    shrink = 2 ** (round_index + 1)

    for bound in free:
        current = around.get(bound.plane_id, PlaneOverride())
        for attribute, span in (("raan_deg", bound.raan_deg), ("phase_deg", bound.phase_deg)):
            if span is None:
                continue
            centre = getattr(current, attribute)
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
    """Vary one environment parameter and report where the target starts to hold.

    This is how the ISL-range finding is produced: intra-plane neighbours sit
    2700.4 km apart at 16 satellites per plane, and the sweep shows availability
    collapsing the moment the link budget falls below that chord.
    """
    payloads = [(scenario, parameter, float(value), strategy) for value in values]

    if max_workers == 1:
        points = [_sweep_one(p) for p in payloads]
    else:
        with ProcessPoolExecutor(max_workers=max_workers) as pool:
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
