import pytest

from engine import load_scenario, simulate

pytestmark = pytest.mark.unit

# scenario -> client -> (visibility %, availability %, max outage seconds)
REFERENCE = {
    "01_full_constellation": {
        "C65": (97.777778, 96.666667, 480),
        "C70": (99.861111, 98.750000, 120),
        "C72": (100.000000, 98.888889, 120),
    },
    "02_first_launch": {
        "C65": (38.194444, 27.222222, 34320),
        "C70": (48.750000, 15.833333, 39480),
        "C72": (58.472222, 12.638889, 47760),
    },
    "03_satellite_outages": {
        "C65": (84.583333, 79.305556, 1440),
        "C70": (90.277778, 80.833333, 1440),
        "C72": (93.055556, 82.500000, 1200),
    },
    "04_link_range": {
        "C65": (97.777778, 77.500000, 5640),
        "C70": (99.861111, 62.222222, 10680),
        "C72": (100.000000, 65.138889, 240),
    },
}


@pytest.mark.parametrize("scenario_name", sorted(REFERENCE))
def test_matches_reference_metrics(data_dir, scenario_name):
    result = simulate(load_scenario(data_dir / f"{scenario_name}.json"))

    for client_id, (visibility, availability, max_outage) in REFERENCE[scenario_name].items():
        metrics = result.metrics[client_id]
        assert metrics.visibility * 100 == pytest.approx(visibility, abs=1e-4)
        assert metrics.availability * 100 == pytest.approx(availability, abs=1e-4)
        assert metrics.max_outage_s == max_outage


def test_full_constellation_meets_target(data_dir):
    result = simulate(load_scenario(data_dir / "01_full_constellation.json"))
    assert all(m.meets_target for m in result.metrics.values())


@pytest.mark.parametrize(
    "scenario_name", ["02_first_launch", "03_satellite_outages", "04_link_range"]
)
def test_degraded_scenarios_miss_target(data_dir, scenario_name):
    result = simulate(load_scenario(data_dir / f"{scenario_name}.json"))
    assert not any(m.meets_target for m in result.metrics.values())


def test_visibility_never_below_availability(data_dir):
    for scenario_name in REFERENCE:
        result = simulate(load_scenario(data_dir / f"{scenario_name}.json"))
        for metrics in result.metrics.values():
            assert metrics.availability <= metrics.visibility + 1e-12


def test_grid_is_left_closed(full_constellation):
    result = simulate(full_constellation)
    assert len(result.time_grid) == 720
    assert result.time_grid[0] == 0
    assert result.time_grid[-1] == 86_280
