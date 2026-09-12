"""Field-precise checks of a scenario file, collected rather than raised.

The organisers' `geometry.validate` stops at the first problem and names it in
a few words — "Invalid satellite" — which is enough for their script and not
for a person holding a file they did not write. The case asks for more: «при
ошибке сервис указывает проблемное поле или объект». So this walks the same
rules, reports every problem in one pass, and gives each one the JSON path to
the value, the value itself and what was expected.

It is meant to be a superset of `geometry.validate`, never looser:
`validate_scenario` still runs the organisers' function afterwards as the
final arbiter, and `test_scenario_check.py` mutates the official files to hold
the two in step. It is stricter in the few places the case text defines a
field their script never reads — `meta.id`, `meta.title`, a site's `name` —
and it refuses identifiers that are not strings and booleans standing in for
numbers, which `geometry.validate` lets through by accident of Python typing.
"""

from __future__ import annotations

import math
from typing import Any

from .errors import Issue, ScenarioError
from .site_conditions import parse_site_conditions

SCHEMA_VERSION = "cosmo-A-1.0"

# A file with every satellite on a missing plane is one mistake made 48 times;
# listing all of them buries the other problems rather than helping.
MAX_ISSUES = 50

# The ranges `geometry.validate` enforces, kept next to each other so the
# parity test and the messages read from one place.
ALTITUDE_KM = (200, 1200)
INCLINATION_DEG = (0, 180)
HORIZON_MAX_S = 172_800
ELEVATION_DEG = (0, 90)
ISL_RANGE_KM = (0, 10_000)
ANGLE_DEG = (0, 360)
LAT_DEG = (-90, 90)
LON_DEG = (-180, 180)
STAGES = (1, 2, 3)
ROLES = ("client", "gateway")


class _Collector:
    def __init__(self) -> None:
        self.issues: list[Issue] = []
        self.total = 0

    def add(self, code: str, field: str | None, message: str, **params: Any) -> None:
        self.total += 1
        if len(self.issues) < MAX_ISSUES:
            self.issues.append(Issue(code, field, message, params))


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _type_name(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "list"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _bounds(lo: float, hi: float, lo_open: bool, hi_open: bool) -> str:
    return f"{'(' if lo_open else '['}{lo:g}, {hi:g}{')' if hi_open else ']'}"


class _Walker:
    """Reads a value at a path and reports what is wrong with it.

    Each reader returns the value when it is usable and `None` otherwise, so the
    checks further down can skip what depends on a value already reported.
    """

    def __init__(self, collector: _Collector) -> None:
        self.c = collector

    def present(self, parent: dict[str, Any], key: str, path: str) -> bool:
        if key not in parent:
            self.c.add("required", path, f"{path} is missing")
            return False
        return True

    def read_object(self, parent: dict[str, Any], key: str, path: str) -> dict[str, Any] | None:
        if not self.present(parent, key, path):
            return None
        return self.expect_object(parent[key], path)

    def expect_object(self, value: Any, path: str) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            self.c.add(
                "wrong_type",
                path,
                f"{path} must be an object, got {_type_name(value)}",
                expected="object",
                actual=_type_name(value),
            )
            return None
        return value

    def read_list(
        self, parent: dict[str, Any], key: str, path: str, *, non_empty: bool = False
    ) -> list[Any] | None:
        if not self.present(parent, key, path):
            return None
        value = parent[key]
        if not isinstance(value, list):
            self.c.add(
                "wrong_type",
                path,
                f"{path} must be a list, got {_type_name(value)}",
                expected="list",
                actual=_type_name(value),
            )
            return None
        if non_empty and not value:
            self.c.add("empty_list", path, f"{path} must not be empty")
            return None
        return value

    def read_string(
        self, parent: dict[str, Any], key: str, path: str, *, non_empty: bool = True
    ) -> str | None:
        if not self.present(parent, key, path):
            return None
        value = parent[key]
        if not isinstance(value, str):
            self.c.add(
                "wrong_type",
                path,
                f"{path} must be a string, got {_type_name(value)}",
                expected="string",
                actual=_type_name(value),
            )
            return None
        if non_empty and not value.strip():
            self.c.add("empty_string", path, f"{path} must not be empty")
            return None
        return value

    def read_number(
        self,
        parent: dict[str, Any],
        key: str,
        path: str,
        *,
        integer: bool = False,
        lo: float | None = None,
        hi: float | None = None,
        lo_open: bool = False,
        hi_open: bool = False,
    ) -> float | None:
        if not self.present(parent, key, path):
            return None
        value = parent[key]
        if not (_is_integer(value) if integer else _is_number(value)):
            expected = "integer" if integer else "number"
            self.c.add(
                "wrong_type",
                path,
                f"{path} must be {'an integer' if integer else 'a number'}, "
                f"got {_type_name(value)} {value!r}",
                expected=expected,
                actual=_type_name(value),
                value=value if _is_number(value) or isinstance(value, str | bool) else None,
            )
            return None
        if not math.isfinite(value):
            self.c.add("not_finite", path, f"{path} must be a finite number, got {value!r}")
            return None
        if lo is not None and hi is not None:
            below = value <= lo if lo_open else value < lo
            above = value >= hi if hi_open else value > hi
            if below or above:
                self.c.add(
                    "out_of_range",
                    path,
                    f"{path} is {value:g}, must be within {_bounds(lo, hi, lo_open, hi_open)}",
                    value=value,
                    min=lo,
                    max=hi,
                    min_inclusive=not lo_open,
                    max_inclusive=not hi_open,
                )
                return None
        elif lo is not None and (value <= lo if lo_open else value < lo):
            relation = ">" if lo_open else ">="
            self.c.add(
                "too_small",
                path,
                f"{path} is {value:g}, must be {relation} {lo:g}",
                value=value,
                min=lo,
                min_inclusive=not lo_open,
            )
            return None
        return value

    def read_choice(
        self, parent: dict[str, Any], key: str, path: str, allowed: tuple[Any, ...]
    ) -> Any | None:
        if not self.present(parent, key, path):
            return None
        value = parent[key]
        # `True in (1, 2, 3)` holds in Python; a boolean is still not a stage.
        if isinstance(value, bool) or value not in allowed or type(value) is float:
            self.c.add(
                "not_allowed",
                path,
                f"{path} is {value!r}, must be one of {', '.join(map(repr, allowed))}",
                value=value if isinstance(value, str | int | float | bool) else None,
                allowed=list(allowed),
            )
            return None
        return value


def collect_issues(scenario: Any) -> tuple[list[Issue], int]:
    """Every problem in a scenario document, capped at `MAX_ISSUES`, and the total."""
    c = _Collector()
    w = _Walker(c)

    if not isinstance(scenario, dict):
        c.add(
            "wrong_type",
            None,
            f"A scenario must be a JSON object, got {_type_name(scenario)}",
            expected="object",
            actual=_type_name(scenario),
        )
        return c.issues, c.total

    if "schema_version" not in scenario:
        c.add(
            "required",
            "schema_version",
            f"schema_version is missing, expected {SCHEMA_VERSION!r}",
            expected=SCHEMA_VERSION,
        )
        return c.issues, c.total
    if scenario["schema_version"] != SCHEMA_VERSION:
        # Anything else is another format; every field below would be noise.
        version = scenario["schema_version"]
        c.add(
            "unsupported_schema",
            "schema_version",
            f"Unsupported schema_version {version!r}, expected {SCHEMA_VERSION!r}",
            value=version if isinstance(version, str | int | float) else None,
            expected=SCHEMA_VERSION,
        )
        return c.issues, c.total

    meta = w.read_object(scenario, "meta", "meta")
    if meta is not None:
        w.read_string(meta, "id", "meta.id")
        w.read_string(meta, "title", "meta.title")

    environment = w.read_object(scenario, "environment", "environment")
    horizon = _check_environment(w, environment) if environment is not None else None

    design = w.read_object(scenario, "design", "design")
    satellite_ids = _check_design(w, design) if design is not None else None

    ground = w.read_list(scenario, "ground_sites", "ground_sites", non_empty=True)
    gateways, clients = (
        _check_ground(w, ground, satellite_ids) if ground is not None else (None, None)
    )

    failures = w.read_list(scenario, "failures", "failures")
    if failures is not None:
        _check_windows(
            w, failures, "failures", "satellite_id", satellite_ids, "design.satellites", horizon
        )

    outages = w.read_list(scenario, "gateway_outages", "gateway_outages")
    if outages is not None:
        _check_windows(
            w,
            outages,
            "gateway_outages",
            "gateway_id",
            gateways,
            "ground_sites",
            horizon,
            clients=clients,
        )

    return c.issues, c.total


def _check_environment(w: _Walker, env: dict[str, Any]) -> int | None:
    p = "environment"
    w.read_number(env, "altitude_km", f"{p}.altitude_km", lo=ALTITUDE_KM[0], hi=ALTITUDE_KM[1])
    w.read_number(
        env,
        "inclination_deg",
        f"{p}.inclination_deg",
        lo=INCLINATION_DEG[0],
        hi=INCLINATION_DEG[1],
        lo_open=True,
    )
    w.read_number(env, "earth_angle0_deg", f"{p}.earth_angle0_deg")
    horizon = w.read_number(
        env, "horizon_s", f"{p}.horizon_s", integer=True, lo=0, hi=HORIZON_MAX_S, lo_open=True
    )
    step = w.read_number(env, "step_s", f"{p}.step_s", integer=True, lo=0, lo_open=True)
    w.read_number(
        env,
        "min_elevation_deg",
        f"{p}.min_elevation_deg",
        lo=ELEVATION_DEG[0],
        hi=ELEVATION_DEG[1],
        hi_open=True,
    )
    w.read_number(
        env,
        "isl_range_km",
        f"{p}.isl_range_km",
        lo=ISL_RANGE_KM[0],
        hi=ISL_RANGE_KM[1],
        lo_open=True,
    )
    w.read_number(env, "target_availability", f"{p}.target_availability", lo=0, hi=1)

    if horizon is None or step is None:
        return int(horizon) if horizon is not None else None

    if step > horizon:
        w.c.add(
            "step_exceeds_horizon",
            f"{p}.step_s",
            f"{p}.step_s is {step:g}, longer than horizon_s {horizon:g}",
            step_s=step,
            horizon_s=horizon,
        )
    elif horizon % step:
        w.c.add(
            "horizon_not_multiple",
            f"{p}.horizon_s",
            f"{p}.horizon_s {horizon:g} is not a whole number of steps of {step:g} s",
            step_s=step,
            horizon_s=horizon,
        )
    return int(horizon)


def _check_unique(
    w: _Walker, seen: dict[str, int], value: str, path: str, list_path: str, index: int
) -> None:
    if value in seen:
        w.c.add(
            "duplicate_id",
            path,
            f"{path} {value!r} repeats {list_path}[{seen[value]}].id",
            value=value,
            first=f"{list_path}[{seen[value]}].id",
        )
    else:
        seen[value] = index


def _check_design(w: _Walker, design: dict[str, Any]) -> set[str] | None:
    w.read_choice(design, "launch_stage", "design.launch_stage", STAGES)

    plane_ids: set[str] | None = None
    planes = w.read_list(design, "planes", "design.planes", non_empty=True)
    if planes is not None:
        plane_ids = set()
        # References are only checked against a list whose every id could be
        # read; otherwise one unreadable plane reports each of its satellites.
        complete = True
        seen: dict[str, int] = {}
        for index, raw in enumerate(planes):
            path = f"design.planes[{index}]"
            plane = w.expect_object(raw, path)
            if plane is None:
                complete = False
                continue
            plane_id = w.read_string(plane, "id", f"{path}.id")
            if plane_id is None or plane_id in seen:
                # A repeated id most likely stands where another plane was
                # meant, so its satellites are not reported as dangling.
                complete = False
            if plane_id is not None:
                _check_unique(w, seen, plane_id, f"{path}.id", "design.planes", index)
                plane_ids.add(plane_id)
            for key in ("raan_deg", "phase_deg"):
                w.read_number(
                    plane, key, f"{path}.{key}", lo=ANGLE_DEG[0], hi=ANGLE_DEG[1], hi_open=True
                )
        if not complete:
            plane_ids = None

    satellites = w.read_list(design, "satellites", "design.satellites", non_empty=True)
    if satellites is None:
        return None

    satellite_ids: set[str] = set()
    complete = True
    seen = {}
    for index, raw in enumerate(satellites):
        path = f"design.satellites[{index}]"
        satellite = w.expect_object(raw, path)
        if satellite is None:
            complete = False
            continue
        satellite_id = w.read_string(satellite, "id", f"{path}.id")
        if satellite_id is not None:
            _check_unique(w, seen, satellite_id, f"{path}.id", "design.satellites", index)
            satellite_ids.add(satellite_id)
        else:
            complete = False
        plane_id = w.read_string(satellite, "plane_id", f"{path}.plane_id")
        if plane_id is not None and plane_ids is not None and plane_id not in plane_ids:
            w.c.add(
                "unknown_reference",
                f"{path}.plane_id",
                f"{path}.plane_id is {plane_id!r}, which is not an id in design.planes",
                value=plane_id,
                target="design.planes",
                known=sorted(plane_ids)[:10],
            )
        w.read_number(satellite, "slot_deg", f"{path}.slot_deg")
        w.read_choice(satellite, "launch_batch", f"{path}.launch_batch", STAGES)

    return satellite_ids if complete else None


def _check_ground(
    w: _Walker, ground: list[Any], satellite_ids: set[str] | None
) -> tuple[set[str] | None, set[str]]:
    gateways: set[str] = set()
    clients: set[str] = set()
    roles: set[str] = set()
    complete = True
    seen: dict[str, int] = {}

    for index, raw in enumerate(ground):
        path = f"ground_sites[{index}]"
        site = w.expect_object(raw, path)
        if site is None:
            complete = False
            continue
        site_id = w.read_string(site, "id", f"{path}.id")
        if site_id is not None:
            _check_unique(w, seen, site_id, f"{path}.id", "ground_sites", index)
            if satellite_ids is not None and site_id in satellite_ids:
                w.c.add(
                    "id_collision",
                    f"{path}.id",
                    f"{path}.id {site_id!r} is also a satellite id; "
                    "ground sites and satellites need distinct ids",
                    value=site_id,
                )
        w.read_string(site, "name", f"{path}.name", non_empty=False)
        role = w.read_choice(site, "role", f"{path}.role", ROLES)
        if role is not None:
            roles.add(role)
            if site_id is not None:
                (gateways if role == "gateway" else clients).add(site_id)
        if role is None or site_id is None:
            complete = False
        w.read_number(site, "lat_deg", f"{path}.lat_deg", lo=LAT_DEG[0], hi=LAT_DEG[1])
        w.read_number(site, "lon_deg", f"{path}.lon_deg", lo=LON_DEG[0], hi=LON_DEG[1])

        try:
            parse_site_conditions(site, index=index)
        except ScenarioError as exc:
            w.c.add("invalid_site_conditions", exc.field, exc.message)

    for role in ROLES:
        # A site whose role could not be read may be the missing one.
        if role not in roles and complete:
            w.c.add(
                "missing_role",
                "ground_sites",
                f"ground_sites has no site with role {role!r}; "
                "a scenario needs at least one client and one gateway",
                role=role,
            )

    return (gateways if complete else None), clients


def _check_windows(
    w: _Walker,
    windows: list[Any],
    list_path: str,
    key: str,
    known: set[str] | None,
    target: str,
    horizon: int | None,
    *,
    clients: set[str] | None = None,
) -> None:
    for index, raw in enumerate(windows):
        path = f"{list_path}[{index}]"
        window = w.expect_object(raw, path)
        if window is None:
            continue

        ref = w.read_string(window, key, f"{path}.{key}")
        if ref is not None and known is not None and ref not in known:
            if clients is not None and ref in clients:
                w.c.add(
                    "not_a_gateway",
                    f"{path}.{key}",
                    f"{path}.{key} is {ref!r}, which is a client, not a gateway",
                    value=ref,
                )
            else:
                w.c.add(
                    "unknown_reference",
                    f"{path}.{key}",
                    f"{path}.{key} is {ref!r}, which is not an id in {target}",
                    value=ref,
                    target=target,
                    known=sorted(known)[:10],
                )

        start = w.read_number(window, "start_s", f"{path}.start_s")
        end = w.read_number(window, "end_s", f"{path}.end_s")
        if start is None or end is None:
            continue

        if start >= end:
            w.c.add(
                "empty_interval",
                f"{path}.end_s",
                f"{path} runs from {start:g} to {end:g} s; end_s must be after start_s",
                start_s=start,
                end_s=end,
            )
        elif start < 0 or (horizon is not None and end > horizon):
            w.c.add(
                "interval_outside_horizon",
                f"{path}.start_s" if start < 0 else f"{path}.end_s",
                f"{path} runs from {start:g} to {end:g} s, outside the calculation period "
                f"[0, {horizon if horizon is not None else '?'}]",
                start_s=start,
                end_s=end,
                horizon_s=horizon,
            )


def collect_warnings(scenario: dict[str, Any]) -> list[Issue]:
    """Things a valid scenario allows that are almost certainly not intended.

    Only meaningful once `collect_issues` has come back empty.
    """
    warnings: list[Issue] = []
    design = scenario["design"]
    stage = design["launch_stage"]
    if not any(sat["launch_batch"] <= stage for sat in design["satellites"]):
        warnings.append(
            Issue(
                "no_active_satellites",
                "design.launch_stage",
                f"No satellite has launch_batch <= {stage}, so nothing flies at this stage "
                "and every site will show 0% availability",
                {"launch_stage": stage},
            )
        )
    return warnings
