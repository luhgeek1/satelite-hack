"""Bad input must come back with a field the user can act on."""

import copy

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
async def scenario(client):
    return (await client.get("/api/v1/scenarios/01_full_constellation")).json()["scenario"]


async def test_valid_scenario_passes_validation(client, scenario):
    response = await client.post("/api/v1/scenarios/validate", json=scenario)
    assert response.json() == {"valid": True, "error": None, "field": None}


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
