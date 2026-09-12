from __future__ import annotations

import copy
import json
import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import geometry
from .errors import Issue, ScenarioError
from .scenario_check import SCHEMA_VERSION as SCHEMA_VERSION
from .scenario_check import collect_issues, collect_warnings
from .site_conditions import SITE_CONDITIONS_KEY, SiteConditions

RESULT_SCHEMA_VERSION = "cosmo-A-result-1.0"


@dataclass(frozen=True, slots=True)
class PlaneOverride:
    raan_deg: float | None = None
    phase_deg: float | None = None


@dataclass(frozen=True, slots=True)
class FailureWindow:
    satellite_id: str
    start_s: int
    end_s: int


@dataclass(frozen=True, slots=True)
class GatewayOutage:
    gateway_id: str
    start_s: int
    end_s: int


@dataclass(frozen=True, slots=True)
class ConfigOverride:
    launch_stage: int | None = None
    planes: dict[str, PlaneOverride] = field(default_factory=dict)
    failures: list[FailureWindow] | None = None
    gateway_outages: list[GatewayOutage] | None = None
    sites: dict[str, SiteConditions | None] = field(default_factory=dict)
    isl_range_km: float | None = None
    min_elevation_deg: float | None = None
    altitude_km: float | None = None
    inclination_deg: float | None = None
    step_s: int | None = None
    horizon_s: int | None = None

    def is_empty(self) -> bool:
        return all(
            value in (None, {}, [])
            for value in (
                self.launch_stage,
                self.planes,
                self.failures,
                self.gateway_outages,
                self.sites,
                self.isl_range_km,
                self.min_elevation_deg,
                self.altitude_km,
                self.inclination_deg,
                self.step_s,
                self.horizon_s,
            )
        )


def load_scenario(path: str | Path) -> dict[str, Any]:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ScenarioError(f"File is not valid JSON: {exc.msg}", field="<file>") from exc
    validate_scenario(raw)
    return raw


def validate_scenario(scenario: Any) -> None:
    issues, total = collect_issues(scenario)
    if issues:
        raise ScenarioError.from_issues(issues, total)

    try:
        geometry.validate(scenario)
    except (KeyError, TypeError, ValueError) as exc:
        raise ScenarioError(
            f"The reference validator rejected the scenario: {exc}", code="rejected"
        ) from exc


def scenario_warnings(scenario: dict[str, Any]) -> list[Issue]:
    return collect_warnings(scenario)


def unwrap_result(document: Any) -> tuple[Any, bool]:
    if isinstance(document, dict) and document.get("schema_version") == RESULT_SCHEMA_VERSION:
        inner = document.get("effective_scenario")
        if not isinstance(inner, dict):
            raise ScenarioError(
                "This is a result file, but its effective_scenario is missing or not an object",
                field="effective_scenario",
                code="required",
            )
        return inner, True
    return document, False


def apply_override(scenario: dict[str, Any], override: ConfigOverride) -> dict[str, Any]:
    effective = copy.deepcopy(scenario)

    if override.launch_stage is not None:
        effective["design"]["launch_stage"] = int(override.launch_stage)

    if override.planes:
        by_id = {plane["id"]: plane for plane in effective["design"]["planes"]}
        for plane_id, plane_override in override.planes.items():
            plane = by_id.get(plane_id)
            if plane is None:
                raise ScenarioError(f"Unknown plane {plane_id!r}", field="design.planes")
            if plane_override.raan_deg is not None:
                plane["raan_deg"] = _wrap_degrees(plane_override.raan_deg)
            if plane_override.phase_deg is not None:
                plane["phase_deg"] = _wrap_degrees(plane_override.phase_deg)

    if override.failures is not None:
        effective["failures"] = [
            {"satellite_id": f.satellite_id, "start_s": int(f.start_s), "end_s": int(f.end_s)}
            for f in override.failures
        ]

    if override.gateway_outages is not None:
        effective["gateway_outages"] = [
            {"gateway_id": g.gateway_id, "start_s": int(g.start_s), "end_s": int(g.end_s)}
            for g in override.gateway_outages
        ]

    if override.sites:
        by_site = {site["id"]: site for site in effective["ground_sites"]}
        for site_id, conditions in override.sites.items():
            site = by_site.get(site_id)
            if site is None:
                raise ScenarioError(f"Unknown ground site {site_id!r}", field="ground_sites")
            if conditions is None:
                site.pop(SITE_CONDITIONS_KEY, None)
            else:
                site[SITE_CONDITIONS_KEY] = conditions.to_dict()

    env = effective["environment"]
    for attr, key in (
        ("isl_range_km", "isl_range_km"),
        ("min_elevation_deg", "min_elevation_deg"),
        ("altitude_km", "altitude_km"),
        ("inclination_deg", "inclination_deg"),
        ("step_s", "step_s"),
        ("horizon_s", "horizon_s"),
    ):
        value = getattr(override, attr)
        if value is not None:
            env[key] = int(value) if key in ("step_s", "horizon_s") else float(value)

    validate_scenario(effective)
    return effective


def _wrap_degrees(value: float) -> float:
    if not math.isfinite(value):
        raise ScenarioError(f"Angle must be finite, got {value!r}", field="design.planes")
    return float(value % 360.0)


def clients(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    return [g for g in scenario["ground_sites"] if g["role"] == "client"]


def gateways(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    return [g for g in scenario["ground_sites"] if g["role"] == "gateway"]


def time_grid(scenario: dict[str, Any]) -> range:
    env = scenario["environment"]
    return range(0, env["horizon_s"], env["step_s"])


def active_satellite_ids(scenario: dict[str, Any], t_s: float) -> set[str]:
    design = scenario["design"]
    failed = {f["satellite_id"] for f in scenario["failures"] if f["start_s"] <= t_s < f["end_s"]}
    return {
        sat["id"]
        for sat in design["satellites"]
        if sat["launch_batch"] <= design["launch_stage"] and sat["id"] not in failed
    }


def offline_gateway_ids(scenario: dict[str, Any], t_s: float) -> set[str]:
    return {
        o["gateway_id"] for o in scenario["gateway_outages"] if o["start_s"] <= t_s < o["end_s"]
    }


def satellite_ids(scenario: dict[str, Any]) -> list[str]:
    return [sat["id"] for sat in scenario["design"]["satellites"]]


def iter_planes(scenario: dict[str, Any]) -> Iterable[dict[str, Any]]:
    return scenario["design"]["planes"]
