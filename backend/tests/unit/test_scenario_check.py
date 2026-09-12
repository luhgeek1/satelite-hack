"""The scenario checks: precise enough to act on, and never looser than the case.

The jury loads a file we have never seen, and the case requires the service to
name the field or object that is wrong. These tests pin the path and the code
of each kind of mistake, and hold our checks in step with the organisers'
`geometry.validate` by breaking the official files at random.
"""

import copy
import json
import math
import random

import pytest

from engine import geometry
from engine.errors import ScenarioError
from engine.scenario import scenario_warnings, validate_scenario
from engine.scenario_check import MAX_ISSUES, collect_issues

pytestmark = pytest.mark.unit

OFFICIAL = [
    "01_full_constellation",
    "02_first_launch",
    "03_satellite_outages",
    "04_link_range",
]


@pytest.fixture(scope="module")
def official(data_dir):
    return {name: json.loads((data_dir / f"{name}.json").read_text()) for name in OFFICIAL}


@pytest.fixture
def scenario(official):
    return copy.deepcopy(official["01_full_constellation"])


@pytest.mark.parametrize("name", OFFICIAL)
def test_official_files_have_no_issues(official, name):
    assert collect_issues(official[name]) == ([], 0)


def _set(path, value):
    def mutate(scenario):
        *parents, last = path
        target = scenario
        for key in parents:
            target = target[key]
        target[last] = value

    return mutate


def _delete(path):
    def mutate(scenario):
        *parents, last = path
        target = scenario
        for key in parents:
            target = target[key]
        del target[last]

    return mutate


def _outage(**window):
    return _set(["gateway_outages"], [window])


@pytest.mark.parametrize(
    ("mutate", "field", "code"),
    [
        (_delete(["meta"]), "meta", "required"),
        (_set(["meta"], "01"), "meta", "wrong_type"),
        (_delete(["meta", "title"]), "meta.title", "required"),
        (_set(["schema_version"], "cosmo-B-2.0"), "schema_version", "unsupported_schema"),
        (_delete(["environment", "step_s"]), "environment.step_s", "required"),
        (_set(["environment", "step_s"], 120.0), "environment.step_s", "wrong_type"),
        (_set(["environment", "step_s"], 0), "environment.step_s", "too_small"),
        (_set(["environment", "step_s"], 7), "environment.horizon_s", "horizon_not_multiple"),
        (_set(["environment", "altitude_km"], "550"), "environment.altitude_km", "wrong_type"),
        (_set(["environment", "altitude_km"], math.inf), "environment.altitude_km", "not_finite"),
        (_set(["environment", "isl_range_km"], 0), "environment.isl_range_km", "out_of_range"),
        (_set(["design", "launch_stage"], 0), "design.launch_stage", "not_allowed"),
        (_set(["design", "planes"], {"id": "P1"}), "design.planes", "wrong_type"),
        (
            _set(["design", "planes", 1, "phase_deg"], -5),
            "design.planes[1].phase_deg",
            "out_of_range",
        ),
        (
            _set(["design", "planes", 1, "raan_deg"], 360),
            "design.planes[1].raan_deg",
            "out_of_range",
        ),
        (_set(["design", "satellites"], []), "design.satellites", "empty_list"),
        (_set(["design", "satellites", 3], "S04"), "design.satellites[3]", "wrong_type"),
        (
            _set(["design", "satellites", 12, "plane_id"], "P9"),
            "design.satellites[12].plane_id",
            "unknown_reference",
        ),
        (
            _set(["design", "satellites", 12, "id"], "S01"),
            "design.satellites[12].id",
            "duplicate_id",
        ),
        (
            _set(["design", "satellites", 3, "launch_batch"], True),
            "design.satellites[3].launch_batch",
            "not_allowed",
        ),
        (_set(["ground_sites", 2, "lat_deg"], 95), "ground_sites[2].lat_deg", "out_of_range"),
        (_set(["ground_sites", 2, "role"], "relay"), "ground_sites[2].role", "not_allowed"),
        (_delete(["ground_sites", 2, "name"]), "ground_sites[2].name", "required"),
        (_set(["ground_sites", 2, "id"], "S05"), "ground_sites[2].id", "id_collision"),
        (
            _set(["failures"], [{"satellite_id": "S99", "start_s": 0, "end_s": 60}]),
            "failures[0].satellite_id",
            "unknown_reference",
        ),
        (
            _set(["failures"], [{"satellite_id": "S01", "start_s": 0, "end_s": 90_000}]),
            "failures[0].end_s",
            "interval_outside_horizon",
        ),
        (
            _set(["failures"], [{"satellite_id": "S01", "start_s": 60, "end_s": 60}]),
            "failures[0].end_s",
            "empty_interval",
        ),
        (
            _outage(gateway_id="C65", start_s=0, end_s=60),
            "gateway_outages[0].gateway_id",
            "not_a_gateway",
        ),
        (_outage(gateway_id="G_MUR", start_s=0), "gateway_outages[0].end_s", "required"),
        (_delete(["gateway_outages"]), "gateway_outages", "required"),
    ],
)
def test_each_mistake_names_its_field(scenario, mutate, field, code):
    mutate(scenario)
    with pytest.raises(ScenarioError) as excinfo:
        validate_scenario(scenario)
    first = excinfo.value.issues[0]
    assert (first.field, first.code) == (field, code)
    assert excinfo.value.field == field


def test_a_file_that_is_not_an_object_is_named_as_such():
    issues, _ = collect_issues([{"schema_version": "cosmo-A-1.0"}])
    assert issues[0].code == "wrong_type"
    assert issues[0].params["expected"] == "object"


def test_a_missing_gateway_is_reported_against_the_site_list(scenario):
    for site in scenario["ground_sites"]:
        site["role"] = "client"
    issues, _ = collect_issues(scenario)
    assert [(i.field, i.code, i.params) for i in issues] == [
        ("ground_sites", "missing_role", {"role": "gateway"})
    ]


def test_every_problem_is_reported_in_one_pass(scenario):
    scenario["environment"]["altitude_km"] = 5
    scenario["design"]["satellites"][7]["plane_id"] = "P7"
    scenario["ground_sites"][1]["lon_deg"] = 200
    scenario["failures"] = [{"satellite_id": "S01", "start_s": 10, "end_s": 5}]

    with pytest.raises(ScenarioError) as excinfo:
        validate_scenario(scenario)

    assert [issue.field for issue in excinfo.value.issues] == [
        "environment.altitude_km",
        "design.satellites[7].plane_id",
        "ground_sites[1].lon_deg",
        "failures[0].end_s",
    ]
    assert excinfo.value.issue_count == 4
    assert "and 3 more problems" in excinfo.value.message


def test_range_issues_carry_what_was_expected(scenario):
    scenario["design"]["planes"][0]["raan_deg"] = 400
    issue = collect_issues(scenario)[0][0]
    assert issue.params == {
        "value": 400,
        "min": 0,
        "max": 360,
        "min_inclusive": True,
        "max_inclusive": False,
    }


def test_a_repeated_plane_id_does_not_flood_its_satellites(scenario):
    scenario["design"]["planes"][1]["id"] = "P1"
    issues, total = collect_issues(scenario)
    assert total == 1
    assert issues[0].code == "duplicate_id"


def test_the_list_is_capped_but_the_count_is_not(scenario):
    for satellite in scenario["design"]["satellites"]:
        satellite["slot_deg"] = "north"
    for _ in range(12):
        scenario["failures"].append({"satellite_id": "S01", "start_s": -1, "end_s": 10})

    issues, total = collect_issues(scenario)
    assert len(issues) == MAX_ISSUES
    assert total == 48 + 12


def test_a_stage_with_nothing_launched_is_a_warning_not_an_error(scenario):
    for satellite in scenario["design"]["satellites"]:
        satellite["launch_batch"] = 3
    scenario["design"]["launch_stage"] = 1

    validate_scenario(scenario)
    geometry.validate(scenario)
    assert [w.code for w in scenario_warnings(scenario)] == ["no_active_satellites"]


def test_official_files_carry_no_warnings(official):
    assert all(not scenario_warnings(official[name]) for name in OFFICIAL)


# --- parity with the organisers' validator -------------------------------------

JUNK = [None, True, False, 0, -1, 1, 3, 1.5, 360, 1e9, -1e9, math.nan, "", "S01", "x", [], {}]


def _leaves(node, path=()):
    """Every position in the document: object members and list items alike."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield (*path, key)
            yield from _leaves(value, (*path, key))
    elif isinstance(node, list):
        for index, value in enumerate(node[:3]):
            yield (*path, index)
            yield from _leaves(value, (*path, index))


def _mutations(official, seed, count):
    rng = random.Random(seed)
    names = sorted(official)
    for _ in range(count):
        scenario = copy.deepcopy(official[rng.choice(names)])
        # One to three changes at once, so interactions between fields are hit.
        for _ in range(rng.randint(1, 3)):
            paths = list(_leaves(scenario))
            if not paths:
                break
            *parents, last = rng.choice(paths)
            target = scenario
            try:
                for key in parents:
                    target = target[key]
                if rng.random() < 0.2 and isinstance(target, dict):
                    del target[last]
                else:
                    target[last] = copy.deepcopy(rng.choice(JUNK))
            except (KeyError, IndexError, TypeError):
                continue
        yield scenario


def _geometry_accepts(scenario):
    try:
        geometry.validate(scenario)
    except Exception:
        return False
    return True


def test_never_looser_than_the_reference_validator(official):
    """Whatever geometry.validate refuses, we refuse too, and say where."""
    checked = 0
    for scenario in _mutations(official, seed=20260912, count=3000):
        if _geometry_accepts(scenario):
            continue
        checked += 1
        issues, _ = collect_issues(scenario)
        assert issues, f"geometry.validate refused a scenario our checks accepted: {scenario}"
    assert checked > 1000


def test_everything_we_accept_the_reference_validator_accepts(official):
    """So the fallback in validate_scenario is a safety net, not a path in use."""
    for scenario in _mutations(official, seed=7, count=3000):
        if not collect_issues(scenario)[0]:
            assert _geometry_accepts(scenario)
