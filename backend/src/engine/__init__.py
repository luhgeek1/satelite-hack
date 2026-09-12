"""Pure calculation core.

Nothing in this package may import FastAPI, SQLAlchemy or anything else from the
service layers: the engine has to stay runnable (and testable) on its own, which
is what `tests/unit` relies on and what the jury can inspect in isolation.

`geometry.py` is the organisers' module, vendored byte-for-byte — see
`tests/unit/test_geometry_vendored.py`, which fails if it ever drifts from the
copy shipped in the case archive.
"""

from .routing import NoRouteReason, RouteResult, RoutingStrategy
from .scenario import (
    ConfigOverride,
    FailureWindow,
    PlaneOverride,
    apply_override,
    load_scenario,
    validate_scenario,
)
from .simulate import SimulationResult, simulate
from .site_conditions import PROFILES, SiteConditions, SiteProfile, active_site_conditions

__all__ = [
    "ConfigOverride",
    "PlaneOverride",
    "FailureWindow",
    "apply_override",
    "load_scenario",
    "validate_scenario",
    "SimulationResult",
    "simulate",
    "RouteResult",
    "RoutingStrategy",
    "NoRouteReason",
    "PROFILES",
    "SiteConditions",
    "SiteProfile",
    "active_site_conditions",
]
