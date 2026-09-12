"""The jury's path through the service, end to end.

Mirrors the case's own acceptance scenarios: load, run, inspect a moment, break
a satellite, compare, export.
"""

import pytest

pytestmark = pytest.mark.integration

FULL = "01_full_constellation"


async def test_health_and_seeded_catalog(client):
    assert (await client.get("/api/ping")).json()["status"] == "ok"

    response = await client.get("/api/v1/scenarios")
    assert response.status_code == 200
    scenarios = response.json()

    ids = {s["id"] for s in scenarios}
    assert {FULL, "02_first_launch", "03_satellite_outages", "04_link_range"} <= ids

    full = next(s for s in scenarios if s["id"] == FULL)
    assert full["satellite_count"] == 48
    assert full["plane_count"] == 3
    assert full["client_count"] == 3
    assert full["steps"] == 720
    assert full["source"] == "official"


async def test_run_matches_reference_metrics(client):
    response = await client.post("/api/v1/simulations", json={"scenario_id": FULL})
    assert response.status_code == 200
    summary = response.json()

    assert summary["steps"] == 720
    assert summary["meets_target"] is True

    by_client = {c["client_id"]: c for c in summary["clients"]}
    assert by_client["C65"]["availability"] == pytest.approx(0.966667, abs=1e-5)
    assert by_client["C70"]["availability"] == pytest.approx(0.98750, abs=1e-5)
    assert by_client["C72"]["availability"] == pytest.approx(0.988889, abs=1e-5)
    assert by_client["C65"]["max_outage_s"] == 480


async def test_runs_are_idempotent(client):
    """The same configuration must map to the same run, not pile up duplicates."""
    first = await client.post("/api/v1/simulations", json={"scenario_id": FULL})
    second = await client.post("/api/v1/simulations", json={"scenario_id": FULL})
    assert first.json()["id"] == second.json()["id"]


async def test_snapshot_and_timeline(client):
    run_id = (await client.post("/api/v1/simulations", json={"scenario_id": FULL})).json()["id"]

    snapshot = (await client.get(f"/api/v1/simulations/{run_id}/snapshot?t_s=0")).json()
    assert snapshot["t_s"] == 0
    assert len(snapshot["satellites"]) == 48
    assert snapshot["active_satellites"] == 48
    assert snapshot["edges"], "a healthy constellation must have links"
    assert {e["type"] for e in snapshot["edges"]} <= {"isl", "ground", "gateway"}

    routed = [r for r in snapshot["routes"] if r["available"]]
    assert routed
    assert routed[0]["path"][0] == routed[0]["client_id"]
    assert routed[0]["hops"] == len(routed[0]["path"]) - 1

    # An off-grid instant snaps down to a real calculation instant.
    assert (await client.get(f"/api/v1/simulations/{run_id}/snapshot?t_s=181")).json()["t_s"] == 120

    availability = (await client.get(f"/api/v1/simulations/{run_id}/availability")).json()
    assert len(availability) == 720
    assert set(availability[0]["state"]) == {"C65", "C70", "C72"}


async def test_configuration_changes_are_applied(client):
    """Switching to the first launch stage must collapse availability."""
    response = await client.post(
        "/api/v1/simulations",
        json={"scenario_id": FULL, "config": {"launch_stage": 1}},
    )
    summary = response.json()
    assert summary["meets_target"] is False
    assert summary["worst_availability"] < 0.3
    assert summary["effective_scenario"]["design"]["launch_stage"] == 1


async def test_failure_injection_changes_routes(client):
    """The case's "отказ аппарата" flow: break a satellite, availability drops."""
    baseline = (await client.post("/api/v1/simulations", json={"scenario_id": FULL})).json()

    degraded = (
        await client.post(
            "/api/v1/simulations",
            json={
                "scenario_id": FULL,
                "config": {
                    "failures": [
                        {"satellite_id": f"S{i:02d}", "start_s": 0, "end_s": 86400}
                        for i in range(1, 13)
                    ]
                },
            },
        )
    ).json()

    assert degraded["worst_availability"] < baseline["worst_availability"]
    assert degraded["id"] != baseline["id"]


async def test_export_is_the_official_format(client):
    run_id = (
        await client.post("/api/v1/simulations", json={"scenario_id": "03_satellite_outages"})
    ).json()["id"]

    payload = (await client.get(f"/api/v1/simulations/{run_id}/export")).json()
    assert payload["schema_version"] == "cosmo-A-result-1.0"
    assert len(payload["routes"]) == 720 * 3
    assert payload["effective_scenario"]["schema_version"] == "cosmo-A-1.0"
    assert any(record["path"] == [] for record in payload["routes"])


async def test_effective_scenario_round_trips(client):
    """An edited scenario must export and import again — the case asks for this."""
    run_id = (
        await client.post(
            "/api/v1/simulations",
            json={
                "scenario_id": FULL,
                "config": {"planes": {"P2": {"raan_deg": 45.0}}, "launch_stage": 2},
            },
        )
    ).json()["id"]

    scenario = (await client.get(f"/api/v1/simulations/{run_id}/scenario")).json()
    assert scenario["design"]["planes"][1]["raan_deg"] == pytest.approx(45.0)

    reimport = await client.post("/api/v1/scenarios", json=scenario)
    assert reimport.status_code == 201


async def test_variants_and_comparison(client):
    full = await client.post(
        "/api/v1/variants",
        json={"name": "Full constellation", "scenario_id": FULL},
    )
    staged = await client.post(
        "/api/v1/variants",
        json={"name": "First launch only", "scenario_id": FULL, "config": {"launch_stage": 1}},
    )
    assert full.status_code == 201 and staged.status_code == 201

    comparison = (
        await client.post(
            "/api/v1/variants/compare",
            json={"variant_ids": [full.json()["id"], staged.json()["id"]]},
        )
    ).json()

    assert len(comparison["variants"]) == 2
    paths = {d["path"] for d in comparison["changed_parameters"]}
    assert "design.launch_stage" in paths
    assert comparison["recommendation"]
    assert all(variant["environment_modified"] is False for variant in comparison["variants"])

    worst = next(m for m in comparison["metrics"] if m["key"] == "worst_availability")
    assert worst["values"][0] > worst["values"][1]


async def test_variant_flags_environment_modified(client):
    """Tuning `isl_range_km` is a sensitivity study, not a design variant — the
    flag has to survive onto the saved variant so a comparison can say so."""
    baseline = await client.post(
        "/api/v1/variants", json={"name": "Baseline", "scenario_id": FULL}
    )
    tuned = await client.post(
        "/api/v1/variants",
        json={"name": "Shorter ISL", "scenario_id": FULL, "config": {"isl_range_km": 2500.0}},
    )
    assert baseline.status_code == 201 and tuned.status_code == 201
    assert baseline.json()["environment_modified"] is False
    assert tuned.json()["environment_modified"] is True

    comparison = (
        await client.post(
            "/api/v1/variants/compare",
            json={"variant_ids": [baseline.json()["id"], tuned.json()["id"]]},
        )
    ).json()
    flags = {v["id"]: v["environment_modified"] for v in comparison["variants"]}
    assert flags[baseline.json()["id"]] is False
    assert flags[tuned.json()["id"]] is True


async def test_site_conditions_raise_the_horizon_and_are_reported(client):
    """A city around a terminal costs visibility, and every layer says so."""
    profiles = (await client.get("/api/v1/scenarios/site-profiles")).json()
    assert {p["id"] for p in profiles} >= {"open", "sea", "forest", "urban", "mountain"}
    urban = next(p for p in profiles if p["id"] == "urban")
    assert urban["rationale"]

    baseline = (await client.post("/api/v1/simulations", json={"scenario_id": FULL})).json()
    assert baseline["site_conditions_active"] is False
    base_c65 = next(c for c in baseline["clients"] if c["client_id"] == "C65")
    assert base_c65["effective_mask_deg"] == 10.0
    assert base_c65["masked_share"] == 0.0

    response = await client.post(
        "/api/v1/simulations",
        json={"scenario_id": FULL, "config": {"sites": {"C65": {"profile": "urban"}}}},
    )
    assert response.status_code == 200
    summary = response.json()
    assert summary["id"] != baseline["id"]
    assert summary["site_conditions_active"] is True

    c65 = next(c for c in summary["clients"] if c["client_id"] == "C65")
    assert c65["site_profile"] == "urban"
    assert c65["effective_mask_deg"] == urban["mask_deg"]
    assert c65["visibility"] < base_c65["visibility"]
    assert c65["masked_share"] > 0
    assert c65["visibility"] + c65["masked_share"] == pytest.approx(base_c65["visibility"])

    c70 = next(c for c in summary["clients"] if c["client_id"] == "C70")
    assert c70["site_profile"] is None
    assert (
        c70["availability"]
        == next(c for c in baseline["clients"] if c["client_id"] == "C70")["availability"]
    )

    site = next(s for s in summary["effective_scenario"]["ground_sites"] if s["id"] == "C65")
    assert site["site_conditions"] == {"profile": "urban", "mask_deg": urban["mask_deg"]}

    # Somewhere in the day a satellite is above the scenario mask yet hidden.
    masked_seen = False
    for t_s in range(0, 86_400, 7200):
        snapshot = (
            await client.get(f"/api/v1/simulations/{summary['id']}/snapshot?t_s={t_s}")
        ).json()
        if snapshot["masked_satellites"].get("C65"):
            masked_seen = True
            for sat_id in snapshot["masked_satellites"]["C65"]:
                assert snapshot["elevation_deg"]["C65"][sat_id] >= 10.0
                assert not any(
                    {e["source"], e["target"]} == {"C65", sat_id} for e in snapshot["edges"]
                )
            break
    assert masked_seen

    bad = await client.post(
        "/api/v1/simulations",
        json={"scenario_id": FULL, "config": {"sites": {"C65": {"profile": "swamp"}}}},
    )
    assert bad.status_code == 422


async def test_site_conditions_show_up_as_a_changed_parameter(client):
    open_field = await client.post(
        "/api/v1/variants", json={"scenario_id": FULL, "name": "Open field"}
    )
    valley = await client.post(
        "/api/v1/variants",
        json={
            "scenario_id": FULL,
            "name": "Valley",
            "config": {"sites": {"C72": {"profile": "mountain"}}},
        },
    )
    assert open_field.status_code == 201 and valley.status_code == 201

    comparison = (
        await client.post(
            "/api/v1/variants/compare",
            json={"variant_ids": [open_field.json()["id"], valley.json()["id"]]},
        )
    ).json()
    path = "ground_sites[C72].site_conditions"
    diff = next(d for d in comparison["changed_parameters"] if d["path"] == path)
    assert diff["values"] == ["open", "mountain 30°"]
