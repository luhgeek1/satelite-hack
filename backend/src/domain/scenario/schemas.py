"""Wire models around scenarios: the catalog rows, details and checks.

The scenario document itself crosses the wire as the plain `cosmo-A-1.0` dict.
The engine validates it, because the rules — and the field-precise report of
what breaks them — belong next to the calculation that depends on them.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from domain.common import WireModel


class ScenarioRenameRequest(WireModel):
    """Body of `PATCH /scenarios/{scenario_id}` — the only field a rename touches."""

    title: str = Field(..., min_length=1, max_length=256)


class ValidationReport(WireModel):
    """Result of a dry-run check, so the UI can report before it commits."""

    valid: bool
    error: str | None = None
    field: str | None = None


class ScenarioSummary(WireModel):
    """One row in the scenario picker."""

    id: str
    title: str
    source: Literal["official", "imported"]
    satellite_count: int
    plane_count: int
    client_count: int
    gateway_count: int
    launch_stage: int
    horizon_s: int
    step_s: int
    steps: int
    target_availability: float
    created_at: str | None = None


class ScenarioDetail(WireModel):
    """Everything the configuration panel and globe need to draw an unrun scenario."""

    summary: ScenarioSummary
    scenario: dict[str, Any]
