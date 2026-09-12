"""Scenario catalog: seeding, import, validation, retrieval."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from core.config import get_settings
from core.errors import ConflictError, NotFoundError, PayloadTooLargeError, ScenarioValidationError
from database.redis import CacheRepo
from database.relational_db import ScenarioInterface, ScenarioRow, UoW
from domain.scenario import ScenarioDetail, ScenarioSummary, ValidationReport
from engine import validate_scenario
from engine.scenario import ScenarioError, clients, gateways

logger = logging.getLogger(__name__)

_ID_SAFE = re.compile(r"[^a-zA-Z0-9_.-]+")


class ScenarioService:
    def __init__(self, *, uow: UoW, scenarios: ScenarioInterface, cache: CacheRepo) -> None:
        self.uow = uow
        self.scenarios = scenarios
        self.cache = cache

    async def list(self) -> list[ScenarioSummary]:
        return [summarise(row) for row in await self.scenarios.list()]

    async def get(self, scenario_id: str) -> ScenarioDetail:
        row = await self._require(scenario_id)
        return ScenarioDetail(summary=summarise(row), scenario=row.payload)

    async def payload(self, scenario_id: str) -> dict[str, Any]:
        return (await self._require(scenario_id)).payload

    async def _require(self, scenario_id: str) -> ScenarioRow:
        row = await self.scenarios.get(scenario_id)
        if row is None:
            raise NotFoundError(f"Scenario {scenario_id!r} not found")
        return row

    def validate(self, payload: Any) -> ValidationReport:
        """Dry run. Never raises — the caller wants a verdict, not an exception."""
        try:
            check_scenario(payload)
        except ScenarioValidationError as exc:
            return ValidationReport(valid=False, error=exc.detail, field=exc.field)
        return ValidationReport(valid=True)

    async def import_scenario(
        self, payload: Any, *, scenario_id: str | None = None, overwrite: bool = False
    ) -> ScenarioSummary:
        """Accept an uploaded scenario after validating it.

        The id defaults to `meta.id` from the file, de-duplicated with a suffix,
        so uploading the same file twice never silently replaces the first one
        unless the caller asked for that.
        """
        check_scenario(payload)

        requested = scenario_id or str(payload["meta"]["id"])
        candidate = _ID_SAFE.sub("-", requested).strip("-")[:128] or "scenario"

        if await self.scenarios.exists(candidate):
            if overwrite:
                await self.scenarios.delete(candidate)
            else:
                candidate = await self._unique_id(candidate)

        row = await self.scenarios.create(
            scenario_id=candidate,
            title=str(payload["meta"]["title"]),
            payload=payload,
        )
        await self.uow.commit()
        return summarise(row)

    async def _unique_id(self, base: str) -> str:
        for suffix in range(2, 100):
            candidate = f"{base}-{suffix}"
            if not await self.scenarios.exists(candidate):
                return candidate
        raise ConflictError(f"Too many scenarios named {base!r}")

    async def delete(self, scenario_id: str) -> None:
        row = await self._require(scenario_id)
        if row.source == "official":
            raise ConflictError("Official case scenarios cannot be deleted")
        await self.scenarios.delete(scenario_id)
        await self.uow.commit()

    async def rename(self, scenario_id: str, title: str) -> ScenarioSummary:
        row = await self._require(scenario_id)
        if row.source == "official":
            raise ConflictError("Official case scenarios cannot be renamed")
        renamed = await self.scenarios.rename(scenario_id, title)
        assert renamed is not None  # the official check above already ruled this out
        await self.uow.commit()
        return summarise(renamed)

    async def seed_official(self) -> int:
        """Load the bundled case scenarios on startup.

        Failures are logged, not raised: a missing data directory must not stop
        the service, because everything else still works with an uploaded file.
        """
        settings = get_settings()
        if not settings.SCENARIO_SEED_ENABLED:
            return 0

        directory = Path(settings.SCENARIO_SEED_DIR)
        if not directory.is_dir():
            logger.warning("Scenario seed directory %s does not exist, skipping", directory)
            return 0

        seeded = 0
        for path in sorted(directory.glob("*.json")):
            try:
                import orjson

                payload = orjson.loads(path.read_bytes())
                check_scenario(payload)
            except Exception as exc:
                logger.warning("Skipping unusable seed scenario %s: %s", path.name, exc)
                continue

            await self.scenarios.upsert_official(
                scenario_id=path.stem,
                title=str(payload["meta"]["title"]),
                payload=payload,
            )
            seeded += 1

        await self.uow.commit()
        logger.info("Seeded %d official scenarios from %s", seeded, directory)
        return seeded


def check_scenario(payload: Any) -> dict[str, Any]:
    """Validate an arbitrary object as a scenario, raising an API-shaped error."""
    settings = get_settings()

    if not isinstance(payload, dict):
        raise ScenarioValidationError("Scenario must be a JSON object", field="<root>")

    design = payload.get("design")
    if isinstance(design, dict):
        satellites = design.get("satellites")
        if isinstance(satellites, list) and len(satellites) > settings.MAX_SATELLITES:
            raise PayloadTooLargeError(
                f"Scenario has {len(satellites)} satellites, limit is {settings.MAX_SATELLITES}"
            )

    environment = payload.get("environment")
    if isinstance(environment, dict):
        horizon, step = environment.get("horizon_s"), environment.get("step_s")
        if isinstance(horizon, int) and isinstance(step, int) and step > 0:
            steps = horizon // step
            if steps > settings.MAX_SIMULATION_STEPS:
                raise PayloadTooLargeError(
                    f"Scenario asks for {steps} calculation steps, "
                    f"limit is {settings.MAX_SIMULATION_STEPS}"
                )

    try:
        validate_scenario(payload)
    except ScenarioError as exc:
        raise ScenarioValidationError(exc.message, field=exc.field) from exc

    return payload


def summarise(row: ScenarioRow) -> ScenarioSummary:
    payload = row.payload
    env = payload["environment"]
    return ScenarioSummary(
        id=row.id,
        title=row.title,
        source=row.source,  # type: ignore[arg-type]
        satellite_count=len(payload["design"]["satellites"]),
        plane_count=len(payload["design"]["planes"]),
        client_count=len(clients(payload)),
        gateway_count=len(gateways(payload)),
        launch_stage=payload["design"]["launch_stage"],
        horizon_s=env["horizon_s"],
        step_s=env["step_s"],
        steps=env["horizon_s"] // env["step_s"],
        target_availability=env["target_availability"],
        created_at=row.created_at.isoformat() if row.created_at else None,
    )
