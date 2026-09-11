"""Resilience, sensitivity and the optimizer job."""

import asyncio

import pytest

pytestmark = pytest.mark.integration

FULL = "01_full_constellation"


async def test_resilience_ranks_satellites_and_reports_gateway_exposure(client):
    response = await client.post(
        "/api/v1/analysis/resilience", json={"scenario_id": "03_satellite_outages"}
    )
    assert response.status_code == 200
    report = response.json()

    impacts = report["impacts"]
    assert impacts, "every flying satellite should be scored"
    # Sorted worst-first, so the ranking is usable straight from the response.
    drops = [i["worst_availability_drop"] for i in impacts]
    assert drops == sorted(drops, reverse=True)
    assert all(0 <= i["criticality"] <= 100 for i in impacts)
    assert impacts[0]["plane_id"] in {"P1", "P2", "P3"}

    gateway = report["gateway_dependency"][0]
    assert gateway["gateway_id"] == "G_MUR"
    assert gateway["serving_satellites"]
    assert 0 <= gateway["busiest_share"] <= 1


async def test_sensitivity_finds_the_isl_threshold(client):
    """Below the 2700.4 km in-plane chord the mesh cannot form along an orbit.

    Sweeping across that value is what turns "availability is low" into a
    hardware requirement we can put in front of an engineer.
    """
    response = await client.post(
        "/api/v1/analysis/sensitivity",
        json={
            "scenario_id": FULL,
            "parameter": "isl_range_km",
            "values": [2000, 2400, 2700, 2750, 3000],
        },
    )
    assert response.status_code == 200
    report = response.json()

    points = {p["value"]: p for p in report["points"]}
    assert points[2000]["worst_availability"] < points[3000]["worst_availability"]
    assert points[2700]["meets_target"] is False
    assert points[2750]["meets_target"] is True
    assert report["threshold"] == 2750


async def test_optimizer_runs_as_a_job_and_respects_locks(client):
    """P1 is pinned, so the recommendation must never move it."""
    started = await client.post(
        "/api/v1/analysis/optimize",
        json={
            "scenario_id": FULL,
            "coarse_steps": 2,
            "refine_rounds": 0,
            "bounds": [
                {"plane_id": "P1"},
                {"plane_id": "P2", "raan_deg": [0, 360]},
                {"plane_id": "P3", "raan_deg": [0, 360]},
            ],
        },
    )
    assert started.status_code == 202
    job_id = started.json()["id"]

    for _ in range(120):
        status = (await client.get(f"/api/v1/jobs/{job_id}")).json()
        if status["status"] in ("done", "failed"):
            break
        await asyncio.sleep(0.5)

    assert status["status"] == "done", status.get("error")

    result = (await client.get(f"/api/v1/jobs/{job_id}/result")).json()
    assert "P1" not in result["changed_planes"]
    assert result["objective"] == "worst_first"
    assert result["verdict"]
    assert result["explored"] > 1


async def test_optimizer_rejects_a_fully_locked_search(client):
    response = await client.post(
        "/api/v1/analysis/optimize",
        json={"scenario_id": FULL, "bounds": [{"plane_id": "P1"}]},
    )
    assert response.status_code == 400
    assert "locked" in response.json()["detail"].lower()
