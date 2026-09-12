import pytest

from engine.optimizer import (
    Objective,
    PlaneBounds,
    SearchMethod,
    optimize,
    planned_runs,
)

pytestmark = pytest.mark.unit

FREE_SPAN = dict(raan_deg=(0.0, 360.0), phase_deg=(0.0, 22.5))

DESCENT = dict(
    method=SearchMethod.COORDINATE_DESCENT,
    axis_steps=6,
    passes=1,
    starts=1,
    refine_rounds=1,
)


@pytest.fixture(scope="module")
def free_planes(full_constellation):
    return [
        PlaneBounds(plane["id"], **FREE_SPAN) for plane in full_constellation["design"]["planes"]
    ]


@pytest.fixture(scope="module")
def descent(full_constellation, free_planes):
    return optimize(full_constellation, bounds=free_planes, **DESCENT)


def test_descent_beats_the_flying_configuration(descent):
    assert descent.improved
    assert descent.best.worst_availability > descent.baseline.worst_availability
    assert descent.changed_planes


def test_descent_is_reproducible(full_constellation, free_planes, descent):
    again = optimize(full_constellation, bounds=free_planes, **DESCENT)

    assert again.best.planes == descent.best.planes
    assert again.best.worst_availability == descent.best.worst_availability


def test_descent_beats_the_grid_for_fewer_runs(full_constellation, free_planes, descent):
    grid = optimize(
        full_constellation,
        bounds=free_planes,
        method=SearchMethod.GRID,
        coarse_steps=2,
        refine_rounds=1,
    )

    assert descent.best.score() > grid.best.score()
    assert descent.explored < grid.explored


def test_the_quoted_run_count_is_never_an_underestimate(descent, free_planes):
    quote = planned_runs(
        2 * len(free_planes),
        SearchMethod.COORDINATE_DESCENT,
        DESCENT["axis_steps"],
        DESCENT["axis_steps"],
        DESCENT["passes"],
        DESCENT["starts"],
        DESCENT["refine_rounds"],
    )

    assert descent.explored <= quote


def test_a_fully_locked_search_returns_the_baseline(full_constellation):
    result = optimize(full_constellation, bounds=[PlaneBounds("P2")], **DESCENT)

    assert not result.improved
    assert result.explored == 1
    assert result.changed_planes == {}


def test_the_objective_can_lead_on_the_mean(full_constellation, free_planes):
    result = optimize(
        full_constellation,
        bounds=free_planes,
        objective=Objective.MEAN_FIRST,
        **DESCENT,
    )

    assert result.best.mean_availability >= result.baseline.mean_availability


def test_a_withdrawn_search_stops_where_it_is(full_constellation, free_planes):
    """The stop request is honoured within one configuration, not at the end."""
    from engine.optimizer import SearchCancelled

    seen: list[int] = []

    with pytest.raises(SearchCancelled):
        optimize(
            full_constellation,
            bounds=free_planes,
            max_workers=1,
            progress=lambda explored, _total: seen.append(explored),
            cancelled=lambda: len(seen) >= 3,
            **DESCENT,
        )

    assert seen[-1] == 3
