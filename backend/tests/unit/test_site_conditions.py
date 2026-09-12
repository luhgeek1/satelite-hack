"""Local site conditions: terrain, buildings, altitude.

The layer sits on top of the organisers' geometry and may only remove ground
links. Every test here checks one of the properties that make it trustworthy:
a neutral site changes nothing, a raised horizon only takes away, the loss is
accounted for exactly, and the angles it measures are the organisers' own.
"""

import copy

import numpy as np
import pytest

from engine import (
    ConfigOverride,
    SiteConditions,
    active_site_conditions,
    apply_override,
    geometry,
    simulate,
)
from engine.scenario import ScenarioError, validate_scenario
from engine.site_conditions import PROFILES, SiteHorizon, prepare_horizons

pytestmark = pytest.mark.unit


def _with_conditions(scenario, site_id, conditions):
    return apply_override(scenario, ConfigOverride(sites={site_id: conditions}))


def _site(scenario, site_id):
    return next(site for site in scenario["ground_sites"] if site["id"] == site_id)


def test_neutral_profiles_change_nothing(full_constellation):
    """Open field and sea raise no horizon, so the reference figures stay byte-identical."""
    baseline = simulate(full_constellation)
    scenario = full_constellation
    for site in scenario["ground_sites"]:
        scenario = _with_conditions(scenario, site["id"], SiteConditions.from_profile("open"))
    scenario = _with_conditions(scenario, "C65", SiteConditions.from_profile("sea"))

    assert active_site_conditions(scenario) == {}
    result = simulate(scenario)
    for client_id, metrics in baseline.metrics.items():
        assert result.metrics[client_id].visibility == metrics.visibility
        assert result.metrics[client_id].availability == metrics.availability
        assert result.metrics[client_id].max_outage_s == metrics.max_outage_s
        assert result.metrics[client_id].masked_steps == 0


def test_a_higher_horizon_only_takes_away(full_constellation):
    """Forest, city, valley: each profile sees less sky than the one before."""
    previous = simulate(full_constellation).metrics["C65"]
    for profile in ("forest", "urban", "mountain"):
        scenario = _with_conditions(full_constellation, "C65", SiteConditions.from_profile(profile))
        current = simulate(scenario).metrics["C65"]
        assert current.visibility <= previous.visibility
        assert current.availability <= previous.availability
        assert current.masked_steps >= previous.masked_steps
        previous = current

    untouched = simulate(scenario).metrics["C70"]
    assert untouched.availability == simulate(full_constellation).metrics["C70"].availability


def test_masked_share_accounts_for_the_visibility_lost(full_constellation):
    """Open-field visibility equals urban visibility plus the share the city hid."""
    baseline = simulate(full_constellation).metrics["C65"]
    urban = simulate(
        _with_conditions(full_constellation, "C65", SiteConditions.from_profile("urban"))
    ).metrics["C65"]

    assert urban.masked_steps > 0
    assert baseline.visible_steps == urban.visible_steps + urban.masked_steps


def test_zero_altitude_reproduces_the_organisers_elevations(full_constellation):
    """Our look angles are computed exactly the way geometry.py computes elevation."""
    scenario = _with_conditions(
        full_constellation, "C65", SiteConditions.from_profile("custom", mask_deg=40.0)
    )
    horizon = prepare_horizons(scenario)["C65"]
    snap = geometry.snapshot(scenario, 3600)
    xyz = np.array([[s["x_km"], s["y_km"], s["z_km"]] for s in snap["satellites"]])

    elevation, _ = horizon.look_angles(xyz)
    theirs = [snap["elevation_deg"]["C65"][s["id"]] for s in snap["satellites"]]
    assert np.allclose(elevation, theirs, atol=1e-9)


def test_altitude_moves_every_angle_only_slightly(full_constellation):
    """A 2 km hill matters at the tenth of a degree, never more, at a 550 km orbit."""
    lifted = _with_conditions(
        full_constellation,
        "C65",
        SiteConditions.from_profile("custom", mask_deg=10.0, altitude_m=2000.0),
    )
    horizon = prepare_horizons(lifted)["C65"]
    snap = geometry.snapshot(lifted, 7200)
    xyz = np.array([[s["x_km"], s["y_km"], s["z_km"]] for s in snap["satellites"]])

    elevation, _ = horizon.look_angles(xyz)
    theirs = np.array([snap["elevation_deg"]["C65"][s["id"]] for s in snap["satellites"]])
    delta = np.abs(elevation - theirs)
    assert delta.max() > 0.0
    assert delta.max() < 0.2


def test_azimuth_mask_blocks_only_the_named_bearings(full_constellation):
    """A wall to the north hides northern satellites and nothing else."""
    wall = ((270.0, 85.0), (89.0, 85.0), (90.0, 0.0), (269.0, 0.0))
    scenario = _with_conditions(
        full_constellation,
        "C65",
        SiteConditions.from_profile("custom", mask_deg=0.0, azimuth_mask=wall),
    )
    horizon = prepare_horizons(scenario)["C65"]
    assert not horizon.conditions.is_neutral(10.0)

    masked_any = False
    for t_s in range(0, 86_400, 2400):
        snap = geometry.snapshot(scenario, t_s)
        xyz = np.array([[s["x_km"], s["y_km"], s["z_km"]] for s in snap["satellites"]])
        elevation, azimuth = horizon.look_angles(xyz)
        admitted = horizon.admits(xyz)
        north = (azimuth >= 270.0) | (azimuth < 90.0)
        above_mask = elevation >= 10.0
        # Southern sky: exactly what the scenario mask admits.
        assert np.array_equal(admitted[~north], above_mask[~north])
        # Northern sky: nothing below the wall gets through.
        assert not np.any(admitted[north] & (elevation[north] < 85.0))
        masked_any |= bool(np.any(above_mask[north]))
    assert masked_any


def test_an_obstructed_gateway_shows_up_as_no_gateway_contact(full_constellation):
    """Surroundings apply to the gateway too, and the no-route reason says so."""
    scenario = _with_conditions(
        full_constellation, "G_MUR", SiteConditions.from_profile("custom", mask_deg=80.0)
    )
    result = simulate(scenario)
    worst = min(m.availability for m in result.metrics.values())
    assert worst < 0.2
    reasons = {reason for m in result.metrics.values() for reason in m.reason_counts}
    assert "no_gateway_contact" in reasons


def test_override_sets_and_clears_the_block(full_constellation):
    with_block = _with_conditions(full_constellation, "C70", SiteConditions.from_profile("urban"))
    assert _site(with_block, "C70")["site_conditions"] == {"profile": "urban", "mask_deg": 25.0}
    assert "site_conditions" not in _site(with_block, "C65")

    cleared = apply_override(with_block, ConfigOverride(sites={"C70": None}))
    assert "site_conditions" not in _site(cleared, "C70")

    with pytest.raises(ScenarioError) as excinfo:
        apply_override(full_constellation, ConfigOverride(sites={"C99": None}))
    assert excinfo.value.field == "ground_sites"


def test_effective_scenario_round_trips_through_validation(full_constellation):
    """The block survives export and re-import: geometry.validate ignores it, ours checks it."""
    scenario = _with_conditions(
        full_constellation,
        "C72",
        SiteConditions.from_profile("mountain", azimuth_mask=((0.0, 40.0), (180.0, 20.0))),
    )
    validate_scenario(scenario)
    geometry.validate(scenario)
    assert active_site_conditions(scenario)["C72"].azimuth_mask == ((0.0, 40.0), (180.0, 20.0))


@pytest.mark.parametrize(
    ("block", "field"),
    [
        ({"profile": "swamp"}, "ground_sites[C65].site_conditions.profile"),
        ({"profile": "custom", "mask_deg": 95}, "ground_sites[C65].site_conditions.mask_deg"),
        ({"profile": "open", "altitude_m": 20_000}, "ground_sites[C65].site_conditions.altitude_m"),
        (
            {"profile": "custom", "azimuth_mask": [[0, 10], [400, 10]]},
            "ground_sites[C65].site_conditions.azimuth_mask[1]",
        ),
        ("urban", "ground_sites[C65].site_conditions"),
    ],
)
def test_validation_names_the_offending_field(full_constellation, block, field):
    broken = copy.deepcopy(full_constellation)
    _site(broken, "C65")["site_conditions"] = block
    with pytest.raises(ScenarioError) as excinfo:
        validate_scenario(broken)
    assert excinfo.value.field == field


def test_profiles_carry_a_rationale():
    """Every default mask is explained, because none of them is a measurement."""
    for profile in PROFILES.values():
        assert profile.rationale
        assert 0 <= profile.mask_deg < 90


def test_horizon_is_built_once_per_site(full_constellation):
    scenario = _with_conditions(full_constellation, "C65", SiteConditions.from_profile("forest"))
    horizons = prepare_horizons(scenario)
    assert set(horizons) == {"C65"}
    assert isinstance(horizons["C65"], SiteHorizon)
