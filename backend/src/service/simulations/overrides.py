from __future__ import annotations

from typing import Any

from core.errors import BadRequestError
from domain.scenario import ConfigModel
from engine import ConfigOverride, FailureWindow, PlaneOverride, SiteConditions, apply_override
from engine.scenario import GatewayOutage, ScenarioError


def to_override(config: ConfigModel) -> ConfigOverride:
    return ConfigOverride(
        launch_stage=config.launch_stage,
        planes={
            plane_id: PlaneOverride(raan_deg=p.raan_deg, phase_deg=p.phase_deg)
            for plane_id, p in config.planes.items()
        },
        failures=(
            [FailureWindow(f.satellite_id, f.start_s, f.end_s) for f in config.failures]
            if config.failures is not None
            else None
        ),
        gateway_outages=(
            [GatewayOutage(g.gateway_id, g.start_s, g.end_s) for g in config.gateway_outages]
            if config.gateway_outages is not None
            else None
        ),
        sites={
            site_id: (
                SiteConditions.from_profile(
                    conditions.profile,
                    mask_deg=conditions.mask_deg,
                    altitude_m=conditions.altitude_m,
                    azimuth_mask=tuple(conditions.azimuth_mask or ()),
                )
                if conditions is not None
                else None
            )
            for site_id, conditions in config.sites.items()
        },
        isl_range_km=config.isl_range_km,
        min_elevation_deg=config.min_elevation_deg,
        altitude_km=config.altitude_km,
        inclination_deg=config.inclination_deg,
        step_s=config.step_s,
        horizon_s=config.horizon_s,
    )


def effective_scenario(base: dict[str, Any], config: ConfigModel) -> dict[str, Any]:
    try:
        return apply_override(base, to_override(config))
    except ScenarioError as exc:
        raise BadRequestError(
            exc.message, details={"field": exc.field} if exc.field else None
        ) from exc
