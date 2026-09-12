import copy

import pytest

from engine import ConfigOverride, FailureWindow, PlaneOverride, apply_override, simulate
from engine.scenario import ScenarioError, validate_scenario

pytestmark = pytest.mark.unit


def test_rejects_wrong_schema_version(full_constellation):
    broken = copy.deepcopy(full_constellation)
    broken["schema_version"] = "cosmo-B-2.0"
    with pytest.raises(ScenarioError) as excinfo:
        validate_scenario(broken)
    assert excinfo.value.field == "schema_version"


def test_names_the_missing_section(full_constellation):
    broken = copy.deepcopy(full_constellation)
    del broken["ground_sites"]
    with pytest.raises(ScenarioError) as excinfo:
        validate_scenario(broken)
    assert excinfo.value.field == "ground_sites"


def test_rejects_horizon_not_divisible_by_step(full_constellation):
    broken = copy.deepcopy(full_constellation)
    broken["environment"]["step_s"] = 7
    with pytest.raises(ScenarioError):
        validate_scenario(broken)


def test_override_does_not_mutate_the_base(full_constellation):
    before = copy.deepcopy(full_constellation)
    apply_override(full_constellation, ConfigOverride(launch_stage=1))
    assert full_constellation == before


def test_launch_stage_changes_the_result(full_constellation):
    staged = apply_override(full_constellation, ConfigOverride(launch_stage=1))
    assert staged["design"]["launch_stage"] == 1

    full = simulate(full_constellation)
    first = simulate(staged)
    assert min(m.availability for m in first.metrics.values()) < min(
        m.availability for m in full.metrics.values()
    )


def test_plane_angles_wrap_into_range(full_constellation):
    result = apply_override(
        full_constellation, ConfigOverride(planes={"P1": PlaneOverride(raan_deg=370.0)})
    )
    assert result["design"]["planes"][0]["raan_deg"] == pytest.approx(10.0)


def test_unknown_plane_is_rejected(full_constellation):
    with pytest.raises(ScenarioError):
        apply_override(
            full_constellation, ConfigOverride(planes={"P9": PlaneOverride(raan_deg=1.0)})
        )


def test_failures_replace_rather_than_append(full_constellation):
    override = ConfigOverride(failures=[FailureWindow("S01", 0, 3600)])
    result = apply_override(full_constellation, override)
    assert result["failures"] == [{"satellite_id": "S01", "start_s": 0, "end_s": 3600}]


def test_failure_reduces_availability(full_constellation):
    baseline = simulate(full_constellation)
    degraded = simulate(
        apply_override(
            full_constellation,
            ConfigOverride(failures=[FailureWindow(f"S{i:02d}", 0, 86_400) for i in range(1, 17)]),
        )
    )
    assert min(m.availability for m in degraded.metrics.values()) < min(
        m.availability for m in baseline.metrics.values()
    )
