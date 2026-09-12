from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

logger = logging.getLogger(__name__)

JobStatus = Literal["queued", "running", "done", "failed"]
MAX_RETAINED_JOBS = 50

LOCAL_OWNER = "local"


def this_machine() -> str:
    return os.environ.get("FLY_MACHINE_ID") or LOCAL_OWNER


def owner_of(job_id: str) -> str | None:
    parts = job_id.split("_")
    if len(parts) != 3 or not parts[1]:
        return None
    return parts[1]


@dataclass
class Job:
    id: str
    kind: Literal["optimize"]
    status: JobStatus = "queued"
    progress: float = 0.0
    explored: int = 0
    total: int = 0
    error: str | None = None
    result: Any | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    finished_at: str | None = None
    task: asyncio.Task[Any] | None = field(default=None, repr=False)

    def note_progress(self, explored: int, total: int) -> None:
        self.explored = explored
        self.total = total
        self.progress = min(1.0, explored / total) if total else 0.0


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def submit(
        self,
        kind: Literal["optimize"],
        work: Callable[[Job], Awaitable[Any]],
    ) -> Job:
        job = Job(id=f"{kind[:3]}_{this_machine()}_{uuid4().hex[:8]}", kind=kind)
        self._jobs[job.id] = job
        self._evict()

        async def runner() -> None:
            job.status = "running"
            try:
                job.result = await work(job)
                job.status = "done"
                job.progress = 1.0
            except asyncio.CancelledError:
                job.status = "failed"
                job.error = "Cancelled"
                raise
            except Exception as exc:
                logger.exception("Job %s failed", job.id)
                job.status = "failed"
                job.error = str(exc)
            finally:
                job.finished_at = datetime.now(UTC).isoformat()

        job.task = asyncio.create_task(runner())
        return job

    def cancel(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if job is None or job.task is None or job.task.done():
            return False
        job.task.cancel()
        return True

    def _evict(self) -> None:
        if len(self._jobs) <= MAX_RETAINED_JOBS:
            return
        finished = sorted(
            (j for j in self._jobs.values() if j.status in ("done", "failed")),
            key=lambda j: j.created_at,
        )
        for job in finished[: len(self._jobs) - MAX_RETAINED_JOBS]:
            self._jobs.pop(job.id, None)


_registry = JobRegistry()


def get_job_registry() -> JobRegistry:
    return _registry
