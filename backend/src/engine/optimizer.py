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
    """Which client aggregate leads the ranking."""

    WORST_FIRST = "worst_first"
    MEAN_FIRST = "mean_first"


class SearchMethod(StrEnum):
    """How the space is walked.

    `GRID` enumerates every combination, which costs `steps ** axes` full-day
    simulations: six free axes at four samples each is 4096 runs to sample RAAN
    only at 0, 90, 180 and 270 degrees. It is thorough in the sense that it
    cannot be trapped, and coarse in the sense that it steps straight over most
    of the space it claims to cover.

    `COORDINATE_DESCENT` moves one axis at a time with the rest held still, which
    costs `starts * passes * axes * steps`. The same budget buys a far finer step
    along each axis, and several independent starts guard against the local
    optimum a single descent can settle into.
    """

    COORDINATE_DESCENT = "coordinate_descent"
    GRID = "grid"


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
    method: SearchMethod = SearchMethod.COORDINATE_DESCENT,
    coarse_steps: int = 6,
    refine_rounds: int = 2,
    axis_steps: int = 12,
    passes: int = 3,
    starts: int = 3,
    max_workers: int | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> OptimizationResult:
    """Search the free plane angles for a better configuration.

    Both methods end with the same local refinement around whatever they found,
    and both fall back to the baseline if they cannot beat it, so a search never
    recommends a configuration worse than the one already flying.
    """
    _install_scenario(scenario)
    baseline = _evaluate(({}, strategy))
    free = [b for b in bounds if not b.locked]

    if not free:
        return OptimizationResult(
            baseline=baseline, best=baseline, explored=1, improved=False, objective=objective
        )

    # Without the scenario's own angles a local step has no centre to move
    # around whenever the search failed to beat the baseline, and the refinement
    # would silently do nothing.
    defaults = {
        plane["id"]: PlaneOverride(plane["raan_deg"], plane["phase_deg"])
        for plane in scenario["design"]["planes"]
    }

    budget = _Budget(
        planned=planned_runs(
            len(_axes(free)), method, coarse_steps, axis_steps, passes, starts, refine_rounds
        ),
        progress=progress,
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
    """Shared progress counter.

    A descent stops as soon as a pass stops improving, so the number of runs it
    will actually make is not known when it starts. The planned figure is what
    the caller is quoted, and the counter is clamped to it so a progress bar
    never reports more than it promised.
    """

    planned: int
    progress: Callable[[int, int], None] | None = None
    done: int = 0

    def advance(self, count: int = 1) -> None:
        self.done += count
        if self.progress:
            self.progress(min(self.done, self.planned), self.planned)


def _axes(free: Sequence[PlaneBounds]) -> list[tuple[str, str, tuple[float, float]]]:
    """Every angle the search is allowed to move, as (plane, attribute, span)."""
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
    """The quote the caller is given before committing. Never an underestimate.

    Counts the baseline, the search itself and the local refinement that follows
    it. A descent that stops improving early spends less, never more.
    """
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
    """Move one angle at a time, from several starting points.

    Holding every other angle still turns one six-dimensional problem into six
    one-dimensional ones, and a one-dimensional sweep can afford a fine step. The
    catch is that a descent settles wherever it first stops improving, so the
    search is repeated from independent starting points and the best is kept. The
    starts are drawn from a fixed seed: the jury must get the same recommendation
    from the same file twice.
    """
    axes = _axes(free)
    rng = random.Random(20260101)
    best: Candidate | None = None

    for start_index in range(max(1, starts)):
        # The first descent starts from the configuration already flying, which
        # is the answer to beat and often already a good one.
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
    """The incumbent with one angle replaced, every other angle pinned.

    Angles the incumbent never set are written out explicitly from the scenario,
    so a sweep on one axis cannot quietly move another back to its default.
    """
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
    """One process pool for the whole search.

    A descent calls out once per axis per pass, dozens of times in a run. Each
    `ProcessPoolExecutor` costs eight interpreter start-ups on a spawn platform,
    so building one per sweep would cost more than the sweeps themselves. The
    scenario rides in the initializer because it is the bulk of every payload and
    never changes while the search runs.
    """

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

    def __exit__(self, *_exc: object) -> None:
        if self._pool is not None:
            self._pool.shutdown()
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
    """Pool initializer: hold the scenario for the life of the worker."""
    global _WORKER_SCENARIO
    pin_worker_threads()
    _WORKER_SCENARIO = scenario


def _evaluate(payload: tuple[dict[str, PlaneOverride], RoutingStrategy]) -> Candidate:
    """Score one configuration. Module-level so the process pool can pickle it."""
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
    """One axis at a time around the incumbent — cheap and good enough here."""
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
    """Vary one environment parameter and report where the target starts to hold.

    This is how the ISL-range finding is produced: intra-plane neighbours sit
    2700.4 km apart at 16 satellites per plane, and the sweep shows availability
    collapsing the moment the link budget falls below that chord.
    """
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
