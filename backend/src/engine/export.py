"""Official result export — `cosmo-A-result-1.0`.

The jury reloads what we write, so this module follows the case letter by
letter: one record per (instant, client) pair, `path` running from the client id
to the gateway id, an empty list when there is no route, and the full effective
scenario embedded so the file reproduces the run that made it.

Anything of ours that the format does not define lives under `summary`, which
the case explicitly permits ("К результату можно добавить сводные показатели").
"""

from __future__ import annotations

from typing import Any

from .scenario import RESULT_SCHEMA_VERSION
from .simulate import SimulationResult


def build_result(result: SimulationResult, *, include_summary: bool = True) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": RESULT_SCHEMA_VERSION,
        "effective_scenario": result.effective_scenario,
        "routes": _routes(result),
    }
    if include_summary:
        payload["summary"] = _summary(result)
    return payload


def _routes(result: SimulationResult) -> list[dict[str, Any]]:
    """Every (instant, client) pair, ordered by time then by client id.

    Ordering is not required by the format but makes two exports diffable, which
    is how we show that a configuration change moved a specific route.
    """
    records = []
    for t_s in result.time_grid:
        step_routes = result.routes.get(t_s, {})
        for client_id in sorted(step_routes):
            records.append(
                {
                    "t_s": t_s,
                    "client_id": client_id,
                    "path": list(step_routes[client_id].path),
                }
            )
    return records


def _summary(result: SimulationResult) -> dict[str, Any]:
    return {
        "routing_strategy": result.strategy.value,
        "target_availability": result.target_availability,
        "step_s": result.step_s,
        "horizon_s": result.horizon_s,
        "steps": len(result.time_grid),
        "clients": [
            {
                "client_id": metrics.client_id,
                "visibility": round(metrics.visibility, 6),
                "availability": round(metrics.availability, 6),
                "meets_target": metrics.meets_target,
                "max_outage_s": metrics.max_outage_s,
                "max_bounded_outage_s": metrics.max_bounded_outage_s,
                "leading_outage_s": metrics.leading_outage_s,
                "trailing_outage_s": metrics.trailing_outage_s,
                "avg_hops": round(metrics.avg_hops, 4) if metrics.avg_hops is not None else None,
                "outage_reasons": metrics.reason_counts,
            }
            for metrics in result.metrics.values()
        ],
    }
