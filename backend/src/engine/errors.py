"""Errors the engine raises about its input.

Kept in a module of their own so that `scenario.py` and the modules it validates
through (`site_conditions.py`, `scenario_check.py`) can share one exception type
without importing each other.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class Issue:
    """One thing wrong with a scenario, precise enough to act on.

    `field` is the JSON path to the value (`design.satellites[12].plane_id`).
    `code` and `params` are stable, so an interface can say it in its own
    language; `message` says the same in English for everyone else.
    """

    code: str
    field: str | None
    message: str
    params: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "field": self.field,
            "message": self.message,
            "params": self.params,
        }


class ScenarioError(ValueError):
    """Invalid input scenario. `field` points the user at what to fix.

    A file checked in one pass can be wrong in several places at once, and
    making someone fix them one upload at a time is the thing to avoid: every
    problem found travels in `issues`, the first one doubles as `message` and
    `field`, and `issue_count` says how many there were if the list was capped.
    """

    def __init__(
        self,
        message: str,
        field: str | None = None,
        *,
        code: str = "invalid",
        params: dict[str, Any] | None = None,
        issues: list[Issue] | None = None,
        issue_count: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.field = field
        self.issues = issues or [Issue(code, field, message, params or {})]
        self.issue_count = issue_count if issue_count is not None else len(self.issues)

    @classmethod
    def from_issues(cls, issues: list[Issue], issue_count: int) -> ScenarioError:
        first = issues[0]
        message = first.message
        if issue_count > 1:
            others = issue_count - 1
            message += f" (and {others} more problem{'s' if others > 1 else ''})"
        return cls(message, first.field, issues=issues, issue_count=issue_count)
