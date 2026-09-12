from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from domain.common import WireModel


class ScenarioRenameRequest(WireModel):
    title: str = Field(..., min_length=1, max_length=256)


class ScenarioIssue(WireModel):
    code: str
    field: str | None = None
    message: str
    params: dict[str, Any] = Field(default_factory=dict)


class ValidationReport(WireModel):
    valid: bool
    error: str | None = None
    field: str | None = None
    issues: list[ScenarioIssue] = Field(default_factory=list)
    issue_count: int = 0
    warnings: list[ScenarioIssue] = Field(default_factory=list)
    from_result_file: bool = False


class ScenarioSummary(WireModel):
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
    warnings: list[ScenarioIssue] = Field(default_factory=list)
    from_result_file: bool = False


class ScenarioDetail(WireModel):
    summary: ScenarioSummary
    scenario: dict[str, Any]
