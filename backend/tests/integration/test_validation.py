"""Bad input must come back with a field the user can act on."""

import copy

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
async def scenario(client):
    return (await client.get("/api/v1/scenarios/01_full_constellation")).json()["scenario"]


async def test_valid_scenario_passes_validation(client, scenario):
    response = await client.post("/api/v1/scenarios/validate", json=scenario)
    assert response.json() == {
        "valid": True,
        "error": None,
        "field": None,
        "issues": [],
        "issue_count": 0,
        "warnings": [],
        "from_result_file": False,
    }


async def test_validation_lists_every_problem_with_its_path(client, scenario):
    broken = copy.deepcopy(scenario)
    broken["design"]["satellites"][12]["plane_id"] = "P9"
    broken["gateway_outages"] = [{"gateway_id": "G_MUR", "start_s": 100, "end_s": 50}]
    report = (await client.post("/api/v1/scenarios/validate", json=broken)).json()

    assert report["valid"] is False
    assert report["issue_count"] == 2
    assert [(i["field"], i["code"]) for i in report["issues"]] == [
        ("design.satellites[12].plane_id", "unknown_reference"),
        ("gateway_outages[0].end_s", "empty_interval"),
    ]
    assert report["issues"][0]["params"]["value"] == "P9"


async def test_a_stage_with_nothing_launched_validates_with_a_warning(client, scenario):
    staged = copy.deepcopy(scenario)
    for satellite in staged["design"]["satellites"]:
        satellite["launch_batch"] = 3
    staged["design"]["launch_stage"] = 1
    report = (await client.post("/api/v1/scenarios/validate", json=staged)).json()

    assert report["valid"] is True
    assert [w["code"] for w in report["warnings"]] == ["no_active_satellites"]


async def test_validation_names_the_broken_field(client, scenario):
    broken = copy.deepcopy(scenario)
    broken["schema_version"] = "nope"
    report = (await client.post("/api/v1/scenarios/validate", json=broken)).json()
    assert report["valid"] is False
    assert report["field"] == "schema_version"


async def test_import_rejects_invalid_scenario_with_a_problem_document(client, scenario):
    broken = copy.deepcopy(scenario)
    del broken["environment"]
    response = await client.post("/api/v1/scenarios", json=broken)

    assert response.status_code == 422
    body = response.json()
    assert body["error_code"] == "SCENARIO_INVALID"
    assert body["details"]["field"] == "environment"


async def test_import_problem_document_carries_every_issue(client, scenario):
    broken = copy.deepcopy(scenario)
    broken["environment"]["altitude_km"] = 5
    broken["ground_sites"][0]["lon_deg"] = 200
    body = (await client.post("/api/v1/scenarios", json=broken)).json()

    assert body["details"]["field"] == "environment.altitude_km"
    assert body["details"]["issue_count"] == 2
    assert body["details"]["issues"][1]["field"] == "ground_sites[0].lon_deg"


async def test_a_file_without_meta_is_a_422_not_a_server_error(client, scenario):
    broken = copy.deepcopy(scenario)
    del broken["meta"]
    response = await client.post("/api/v1/scenarios", json=broken)

    assert response.status_code == 422
    assert response.json()["details"]["field"] == "meta"


async def test_a_json_list_is_named_by_the_scenario_checks(client, scenario):
    response = await client.post("/api/v1/scenarios", json=[scenario])

    assert response.status_code == 422
    body = response.json()
    assert body["error_code"] == "SCENARIO_INVALID"
    assert body["details"]["issues"][0]["code"] == "wrong_type"


async def test_an_upload_that_is_not_json_says_so(client):
    response = await client.post(
        "/api/v1/scenarios/upload",
        files={"file": ("broken.json", b'{"schema_version": ', "application/json")},
    )

    assert response.status_code == 422
    assert response.json()["details"]["issues"][0]["code"] == "invalid_json"


async def test_too_many_steps_is_named_with_the_numbers(client, scenario):
    heavy = copy.deepcopy(scenario)
    heavy["environment"].update(horizon_s=172_800, step_s=10)
    response = await client.post("/api/v1/scenarios", json=heavy)

    assert response.status_code == 413
    body = response.json()
    assert body["error_code"] == "SCENARIO_TOO_LARGE"
    issue = body["details"]["issues"][0]
    assert (issue["field"], issue["code"]) == ("environment.step_s", "too_many_steps")
    assert issue["params"]["steps"] == 17_280


async def test_a_two_day_horizon_at_twenty_seconds_is_accepted(client, scenario):
    long_run = copy.deepcopy(scenario)
    long_run["environment"].update(horizon_s=172_800, step_s=20)
    report = (await client.post("/api/v1/scenarios/validate", json=long_run)).json()
    assert report["valid"] is True


async def test_an_exported_result_file_imports_its_scenario(client):
    run_id = (
        await client.post(
            "/api/v1/simulations",
            json={"scenario_id": "01_full_constellation", "config": {"launch_stage": 2}},
        )
    ).json()["id"]
    result = (await client.get(f"/api/v1/simulations/{run_id}/export")).json()

    report = (await client.post("/api/v1/scenarios/validate", json=result)).json()
    assert report["valid"] is True
    assert report["from_result_file"] is True

    response = await client.post("/api/v1/scenarios", json=result)
    assert response.status_code == 201
    imported = response.json()
    assert imported["from_result_file"] is True
    assert imported["launch_stage"] == 2

    stored = (await client.get(f"/api/v1/scenarios/{imported['id']}")).json()["scenario"]
    assert stored == result["effective_scenario"]
    await client.delete(f"/api/v1/scenarios/{imported['id']}")


async def test_unknown_scenario_is_a_404(client):
    response = await client.post("/api/v1/simulations", json={"scenario_id": "nope"})
    assert response.status_code == 404
    assert response.json()["error_code"] == "NOT_FOUND"


async def test_both_or_neither_scenario_source_is_rejected(client, scenario):
    assert (await client.post("/api/v1/simulations", json={})).status_code == 400
    response = await client.post(
        "/api/v1/simulations", json={"scenario_id": "x", "scenario": scenario}
    )
    assert response.status_code == 400


async def test_snapshot_outside_the_horizon_is_rejected(client):
    run_id = (
        await client.post("/api/v1/simulations", json={"scenario_id": "01_full_constellation"})
    ).json()["id"]
    response = await client.get(f"/api/v1/simulations/{run_id}/snapshot?t_s=999999")
    assert response.status_code == 400
    assert response.json()["details"]["field"] == "t_s"
