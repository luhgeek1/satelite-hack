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
        row = await self.session.get(ScenarioRow, scenario_id)
        if row is None or row.source == "official":
            return None

        row.title = title
        row.payload = {**row.payload, "meta": {**row.payload["meta"], "title": title}}
        await self.session.flush()
        return row
