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


class ScenarioIssue(WireModel):
    """One problem, or one warning, about a scenario document.

    `field` is the JSON path to the value (`design.satellites[12].plane_id`).
    `code` and `params` are stable so the interface can phrase it in the user's
    language; `message` is the same in English.
    """

    code: str
    field: str | None = None
    message: str
    params: dict[str, Any] = Field(default_factory=dict)


class ValidationReport(WireModel):
    """Result of a dry-run check, so the UI can report before it commits.

    `error` and `field` describe the first problem; `issues` holds all of them
    (capped, with `issue_count` the true total). `warnings` are only reported
    for a valid scenario.
    """

    valid: bool
    error: str | None = None
    field: str | None = None
    issues: list[ScenarioIssue] = Field(default_factory=list)
    issue_count: int = 0
    warnings: list[ScenarioIssue] = Field(default_factory=list)
    from_result_file: bool = False


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


class ScenarioImported(ScenarioSummary):
    """The picker row for a scenario just imported, and what to tell its author.

    `from_result_file` is set when the upload was an exported result and its
    `effective_scenario` is what got imported.
    """

    warnings: list[ScenarioIssue] = Field(default_factory=list)
    from_result_file: bool = False


class ScenarioDetail(WireModel):
    """Everything the configuration panel and globe need to draw an unrun scenario."""

    summary: ScenarioSummary
    scenario: dict[str, Any]
