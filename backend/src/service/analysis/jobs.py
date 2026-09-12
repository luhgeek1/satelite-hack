"""In-process registry for the one operation that outlives a request.

Deliberately not Celery or ARQ. Optimizer runs finish in tens of seconds, there
is exactly one job kind, and a broker would add a moving part that can fail in
front of the jury without buying anything. The trade-off is explicit: jobs do
not survive a restart.

They do survive a second machine, though. The registry belongs to one process,
so a poll load-balanced to the other machine used to find nothing and answer
404 — which is what the progress bar showed: a search that stalled at 1%% while
roughly half its polls went to the wrong place. The owning machine is therefore
written into the job id, and the API asks Fly's proxy to replay a misdirected
poll to it. See `api/v1/analysis/jobs.py`.
"""

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

# Off Fly — local dev, tests — every job is owned by the only process there is,
# so the marker compares equal to itself and nothing is ever replayed.
LOCAL_OWNER = "local"


def this_machine() -> str:
    """The machine running this process."""
    return os.environ.get("FLY_MACHINE_ID") or LOCAL_OWNER


def owner_of(job_id: str) -> str | None:
    """Read the owning machine back out of a job id.

    `None` for an id that carries no owner — one minted before this was added,
    or a string the caller invented.
    """
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
        """Keep the newest jobs only — this is a demo service, not an archive."""
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
