"""Data access for runs and saved variants."""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .variants_table import SimulationRunRow, VariantRow


class SimulationRunInterface:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, run_id: str) -> SimulationRunRow | None:
        return await self.session.get(SimulationRunRow, run_id)

    async def create(self, **fields: Any) -> SimulationRunRow:
        row = SimulationRunRow(**fields)
        self.session.add(row)
        await self.session.flush()
        return row

    async def upsert(self, run_id: str, **fields: Any) -> SimulationRunRow:
        """Runs are keyed by a content hash, so an identical re-run just refreshes.

        That makes `POST /simulations` idempotent: dragging a slider back to where
        it was returns the same id instead of littering the table.
        """
        existing = await self.session.get(SimulationRunRow, run_id)
        if existing is None:
            return await self.create(id=run_id, **fields)
        for key, value in fields.items():
            setattr(existing, key, value)
        await self.session.flush()
        return existing

    async def prune(self, keep_ids: set[str], limit: int = 200) -> int:
        """Drop unreferenced runs beyond `limit`, newest kept.

        Runs accumulate fast during a demo; saved variants and anything in
        `keep_ids` are never touched.
        """
        stmt = (
            select(SimulationRunRow.id)
            .outerjoin(VariantRow, VariantRow.run_id == SimulationRunRow.id)
            .where(VariantRow.id.is_(None))
            .order_by(SimulationRunRow.created_at.desc())
            .offset(limit)
        )
        stale = [rid for rid in (await self.session.scalars(stmt)).all() if rid not in keep_ids]
        if not stale:
            return 0
        await self.session.execute(delete(SimulationRunRow).where(SimulationRunRow.id.in_(stale)))
        return len(stale)


class VariantInterface:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self) -> list[VariantRow]:
        stmt = select(VariantRow).order_by(VariantRow.created_at.desc())
        rows = await self.session.scalars(stmt)
        return list(rows.unique().all())

    async def get(self, variant_id: str) -> VariantRow | None:
        stmt = select(VariantRow).where(VariantRow.id == variant_id)
        return (await self.session.scalars(stmt)).unique().one_or_none()

    async def get_many(self, variant_ids: list[str]) -> list[VariantRow]:
        """Returned in the order asked for, so comparison columns stay predictable."""
        stmt = select(VariantRow).where(VariantRow.id.in_(variant_ids))
        rows = (await self.session.scalars(stmt)).unique().all()
        by_id = {row.id: row for row in rows}
        return [by_id[vid] for vid in variant_ids if vid in by_id]

    async def create(self, **fields: Any) -> VariantRow:
        row = VariantRow(**fields)
        self.session.add(row)
        await self.session.flush()
        return row

    async def delete(self, variant_id: str) -> bool:
        stmt = delete(VariantRow).where(VariantRow.id == variant_id).returning(VariantRow.id)
        return (await self.session.scalar(stmt)) is not None
