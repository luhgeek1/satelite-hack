from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class Issue:
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
