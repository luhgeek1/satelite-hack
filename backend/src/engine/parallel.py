from __future__ import annotations

import os

_SINGLE_THREAD_ENV = (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "NUMEXPR_NUM_THREADS",
)


def pin_worker_threads() -> None:
    for name in _SINGLE_THREAD_ENV:
        os.environ.setdefault(name, "1")


def resolve_workers(max_workers: int | None) -> int:
    if max_workers is not None:
        return max(1, max_workers)
    return max(1, (os.cpu_count() or 2) - 2)
