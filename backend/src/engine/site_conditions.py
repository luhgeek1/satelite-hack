from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from . import geometry
from .errors import ScenarioError

SITE_CONDITIONS_KEY = "site_conditions"
CUSTOM_PROFILE = "custom"

MASK_MIN_DEG = 0.0
MASK_MAX_DEG = 90.0
ALTITUDE_MIN_M = -500.0
ALTITUDE_MAX_M = 9000.0


@dataclass(frozen=True, slots=True)
class SiteProfile:
    id: str
    mask_deg: float
    altitude_m: float
    rationale: str


PROFILES: dict[str, SiteProfile] = {
    "open": SiteProfile(
        "open",
        0.0,
        0.0,
        "Open tundra or field: nothing rises above the terminal's own mask.",
    ),
    "sea": SiteProfile(
        "sea",
        0.0,
        0.0,
        "Coast, ship or platform at sea level: a clean horizon in every direction.",
    ),
    "forest": SiteProfile(
        "forest",
        15.0,
        0.0,
        "Northern taiga: 20-30 m stands within a hundred metres hide the low sky.",
    ),
    "urban": SiteProfile(
        "urban",
        25.0,
        0.0,
        "Mid-rise blocks a street away: anything below about 25 degrees is behind a wall.",
    ),
    "mountain": SiteProfile(
        "mountain",
        30.0,
        0.0,
        "A valley floor: ridges take the low sky on most bearings.",
    ),
}


@dataclass(frozen=True, slots=True)
class SiteConditions:
    profile: str
    mask_deg: float
    altitude_m: float = 0.0
    azimuth_mask: tuple[tuple[float, float], ...] = field(default_factory=tuple)

    @classmethod
    def from_profile(
        cls,
        profile: str,
        *,
        mask_deg: float | None = None,
        altitude_m: float | None = None,
        azimuth_mask: tuple[tuple[float, float], ...] = (),
    ) -> SiteConditions:
        base = PROFILES.get(profile)
        if base is None and profile != CUSTOM_PROFILE:
            raise ScenarioError(f"Unknown site profile {profile!r}")
        return cls(
            profile=profile,
            mask_deg=float(mask_deg if mask_deg is not None else (base.mask_deg if base else 0.0)),
            altitude_m=float(
                altitude_m if altitude_m is not None else (base.altitude_m if base else 0.0)
            ),
            azimuth_mask=tuple((float(a), float(e)) for a, e in azimuth_mask),
        )

    @classmethod
    def from_dict(cls, raw: Any, *, field_path: str) -> SiteConditions:
        if not isinstance(raw, dict):
            raise ScenarioError("site_conditions must be an object", field=field_path)

        profile = raw.get("profile", CUSTOM_PROFILE)
        if not isinstance(profile, str) or (profile not in PROFILES and profile != CUSTOM_PROFILE):
            raise ScenarioError(
                f"Unknown site profile {profile!r}; expected one of "
                f"{', '.join([*PROFILES, CUSTOM_PROFILE])}",
                field=f"{field_path}.profile",
            )

        mask = raw.get("mask_deg")
        if mask is not None and not (geometry.finite(mask) and MASK_MIN_DEG <= mask < MASK_MAX_DEG):
            raise ScenarioError(
                f"mask_deg must be a finite angle in [{MASK_MIN_DEG:g}, {MASK_MAX_DEG:g})",
                field=f"{field_path}.mask_deg",
            )

        altitude = raw.get("altitude_m")
        if altitude is not None and not (
            geometry.finite(altitude) and ALTITUDE_MIN_M <= altitude <= ALTITUDE_MAX_M
        ):
            raise ScenarioError(
                f"altitude_m must be finite and within [{ALTITUDE_MIN_M:g}, {ALTITUDE_MAX_M:g}]",
                field=f"{field_path}.altitude_m",
            )

        points = raw.get("azimuth_mask") or []
        if not isinstance(points, list):
            raise ScenarioError("azimuth_mask must be a list", field=f"{field_path}.azimuth_mask")
        parsed: list[tuple[float, float]] = []
        for index, point in enumerate(points):
            if (
                not isinstance(point, list | tuple)
                or len(point) != 2
                or not all(geometry.finite(v) for v in point)
                or not (0 <= point[0] < 360 and MASK_MIN_DEG <= point[1] < MASK_MAX_DEG)
            ):
                raise ScenarioError(
                    "azimuth_mask entries must be [azimuth_deg 0..360, elevation_deg 0..90)",
                    field=f"{field_path}.azimuth_mask[{index}]",
                )
            parsed.append((float(point[0]), float(point[1])))

        return cls.from_profile(
            profile, mask_deg=mask, altitude_m=altitude, azimuth_mask=tuple(parsed)
        )

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"profile": self.profile, "mask_deg": self.mask_deg}
        if self.altitude_m:
            out["altitude_m"] = self.altitude_m
        if self.azimuth_mask:
            out["azimuth_mask"] = [[a, e] for a, e in self.azimuth_mask]
        return out

    @property
    def peak_mask_deg(self) -> float:
        return max([self.mask_deg, *(e for _, e in self.azimuth_mask)])

    def is_neutral(self, scenario_mask_deg: float) -> bool:
        return self.altitude_m == 0.0 and self.peak_mask_deg <= scenario_mask_deg


def parse_site_conditions(
    site: dict[str, Any], *, index: int | None = None
) -> SiteConditions | None:
    raw = site.get(SITE_CONDITIONS_KEY)
    if raw is None:
        return None
    where = site.get("id", index if index is not None else "?")
    return SiteConditions.from_dict(raw, field_path=f"ground_sites[{where}].{SITE_CONDITIONS_KEY}")


def active_site_conditions(scenario: dict[str, Any]) -> dict[str, SiteConditions]:
    scenario_mask = float(scenario["environment"]["min_elevation_deg"])
    active: dict[str, SiteConditions] = {}
    for site in scenario["ground_sites"]:
        conditions = parse_site_conditions(site)
        if conditions is not None and not conditions.is_neutral(scenario_mask):
            active[site["id"]] = conditions
    return active


@dataclass(frozen=True, slots=True)
class SiteHorizon:
    site_id: str
    conditions: SiteConditions
    scenario_mask_deg: float
    position: np.ndarray
    up: np.ndarray
    east: np.ndarray
    north: np.ndarray
    mask_azimuths: np.ndarray
    mask_elevations: np.ndarray

    @classmethod
    def build(
        cls, site: dict[str, Any], conditions: SiteConditions, scenario_mask_deg: float
    ) -> SiteHorizon:
        lat = math.radians(site["lat_deg"])
        lon = math.radians(site["lon_deg"])
        up = geometry.ground_position(site) / geometry.R
        east = np.array([-math.sin(lon), math.cos(lon), 0.0])
        north = np.array(
            [-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)]
        )
        position = up * (geometry.R + conditions.altitude_m / 1000.0)

        points = sorted(conditions.azimuth_mask)
        return cls(
            site_id=site["id"],
            conditions=conditions,
            scenario_mask_deg=scenario_mask_deg,
            position=position,
            up=up,
            east=east,
            north=north,
            mask_azimuths=np.array([a for a, _ in points], dtype=float),
            mask_elevations=np.array([e for _, e in points], dtype=float),
        )

    def look_angles(self, xyz: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        dif = xyz - self.position
        dist = np.linalg.norm(dif, axis=1)
        elevation = np.degrees(np.arcsin(np.clip(dif @ self.up / dist, -1.0, 1.0)))
        azimuth = np.degrees(np.arctan2(dif @ self.east, dif @ self.north)) % 360.0
        return elevation, azimuth

    def effective_mask(self, azimuth: np.ndarray) -> np.ndarray:
        mask = np.full(azimuth.shape, max(self.scenario_mask_deg, self.conditions.mask_deg))
        if self.mask_azimuths.size:
            profile = np.interp(azimuth, self.mask_azimuths, self.mask_elevations, period=360.0)
            mask = np.maximum(mask, profile)
        return mask

    def admits(self, xyz: np.ndarray) -> np.ndarray:
        elevation, azimuth = self.look_angles(xyz)
        return elevation >= self.effective_mask(azimuth)


def prepare_horizons(scenario: dict[str, Any]) -> dict[str, SiteHorizon]:
    scenario_mask = float(scenario["environment"]["min_elevation_deg"])
    active = active_site_conditions(scenario)
    by_id = {site["id"]: site for site in scenario["ground_sites"]}
    return {
        site_id: SiteHorizon.build(by_id[site_id], conditions, scenario_mask)
        for site_id, conditions in active.items()
    }


def apply_site_conditions(
    snap: dict[str, Any], horizons: dict[str, SiteHorizon]
) -> tuple[dict[str, Any], dict[str, list[str]]]:
    if not horizons:
        return snap, {}

    ids = [sat["id"] for sat in snap["satellites"]]
    index = {sat_id: k for k, sat_id in enumerate(ids)}
    xyz = np.array([[sat["x_km"], sat["y_km"], sat["z_km"]] for sat in snap["satellites"]])
    admitted = {site_id: horizon.admits(xyz) for site_id, horizon in horizons.items()}

    masked: dict[str, list[str]] = {site_id: [] for site_id in horizons}
    kept: list[list[Any]] = []
    for edge in snap["edges"]:
        a, b = edge[0], edge[1]
        site_id, sat_id = (a, b) if a in horizons else (b, a) if b in horizons else (None, None)
        if site_id is None or sat_id not in index or admitted[site_id][index[sat_id]]:
            kept.append(edge)
        else:
            masked[site_id].append(sat_id)

    filtered = dict(snap)
    filtered["edges"] = kept
    return filtered, masked
