"""Errors the engine raises about its input.

Kept in a module of their own so that `scenario.py` and the modules it validates
through (`site_conditions.py`) can share one exception type without importing
each other.
"""

from __future__ import annotations


class ScenarioError(ValueError):
    """Invalid input scenario. `field` points the user at what to fix."""

    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.field = field
