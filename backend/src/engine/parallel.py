"""How much of the machine a fan-out is allowed to take."""

from __future__ import annotations

import os

# Each worker runs numpy, and numpy on macOS opens a thread pool of its own. A
# pool of eight processes then asks for eighty threads on ten cores and spends
# its time context-switching: pinning the maths to one thread per worker cut a
# 729-point search from 77 s to 54 s.
_SINGLE_THREAD_ENV = (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "NUMEXPR_NUM_THREADS",
)


def pin_worker_threads() -> None:
    """Keep one worker to one core's worth of maths. Call before importing work."""
    for name in _SINGLE_THREAD_ENV:
        os.environ.setdefault(name, "1")


def resolve_workers(max_workers: int | None) -> int:
    """Leave the machine usable.

    An unbounded pool takes every core, and a search of a few thousand
    configurations then locks up the laptop it is running on for minutes. Two
    cores stay free for the API, the browser and the person watching.
    """
    if max_workers is not None:
        return max(1, max_workers)
    return max(1, (os.cpu_count() or 2) - 2)
