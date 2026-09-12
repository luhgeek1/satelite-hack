"""Data access for scenarios."""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .scenarios_table import ScenarioRow


class ScenarioInterface:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self) -> list[ScenarioRow]:
        """Official scenarios first, then newest imports — the picker's order."""
        stmt = select(ScenarioRow).order_by(
            (ScenarioRow.source != "official"),
            ScenarioRow.id,
            ScenarioRow.created_at.desc(),
        )
        rows = await self.session.scalars(stmt)
        return list(rows.all())

    async def get(self, scenario_id: str) -> ScenarioRow | None:
        return await self.session.get(ScenarioRow, scenario_id)

    async def exists(self, scenario_id: str) -> bool:
        stmt = select(ScenarioRow.id).where(ScenarioRow.id == scenario_id)
        return (await self.session.scalar(stmt)) is not None

    async def create(
        self,
        *,
        scenario_id: str,
        title: str,
        payload: dict[str, Any],
        source: str = "imported",
        note: str | None = None,
    ) -> ScenarioRow:
        row = ScenarioRow(id=scenario_id, title=title, payload=payload, source=source, note=note)
        self.session.add(row)
        await self.session.flush()
        return row

    async def upsert_official(
        self, *, scenario_id: str, title: str, payload: dict[str, Any]
    ) -> None:
        """Seed or refresh a bundled scenario without disturbing imports.

        Used on startup, so a redeploy picks up a corrected case file while any
        scenario the jury uploaded stays exactly as they left it.
        """
        stmt = (
            insert(ScenarioRow)
            .values(id=scenario_id, title=title, payload=payload, source="official")
            .on_conflict_do_update(
                index_elements=[ScenarioRow.id],
                set_={"title": title, "payload": payload, "source": "official"},
                where=ScenarioRow.source == "official",
            )
        )
        await self.session.execute(stmt)

    async def delete(self, scenario_id: str) -> bool:
        stmt = (
            delete(ScenarioRow)
            .where(ScenarioRow.id == scenario_id, ScenarioRow.source != "official")
            .returning(ScenarioRow.id)
        )
        return (await self.session.scalar(stmt)) is not None

    async def rename(self, scenario_id: str, title: str) -> ScenarioRow | None:
        """Rename an imported scenario or saved import — never an official one.

        `seed_official` overwrites an official row's title from the case file
        on every startup, so a rename there would silently vanish; the source
        check here is what `delete` already does for the same reason.
        """
        row = await self.session.get(ScenarioRow, scenario_id)
        if row is None or row.source == "official":
            return None

        row.title = title
        # `payload` is plain JSONB (no mutable tracking), so the nested title
        # must be replaced via a fresh dict, not mutated in place.
        row.payload = {**row.payload, "meta": {**row.payload["meta"], "title": title}}
        await self.session.flush()
        return row
