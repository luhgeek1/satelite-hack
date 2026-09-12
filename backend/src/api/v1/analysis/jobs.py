"""Job status for the optimizer.

The registry lives in the process that started the search (see
`service/analysis/jobs.py`), so with more than one machine behind the load
balancer a poll lands on the owner only some of the time. Rather than move job
state into a shared store for one job kind, the owner is encoded in the job id
and a misdirected poll is handed back to Fly's proxy with a `fly-replay` header,
which re-runs the request on the right machine. The client sees one ordinary
response and never learns this happened.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from domain.analysis import JobStatusModel, OptimizeResult
from service.analysis import AnalysisService, get_analysis_service
from service.analysis.jobs import owner_of, this_machine

router = APIRouter()

# Set by the proxy on a request it has already moved. Without this guard a job
# whose machine is gone would bounce between machines instead of 404ing.
_REPLAYED = "fly-replay-src"


def _replay_to_owner(request: Request, job_id: str) -> Response | None:
    """Ask the proxy to re-run this request on the machine holding the job.

    `None` means the request is already in the right place: we own the job, the
    id names no owner, or the proxy has moved this request once already.
    """
    if _REPLAYED in request.headers:
        return None

    owner = owner_of(job_id)
    if owner is None or owner == this_machine():
        return None

    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
        # `prefer_instance` rather than `instance`: if that machine has been
        # replaced the poll still gets answered — by a machine that will honestly
        # say the job is gone — instead of failing at the proxy.
        headers={"fly-replay": f"prefer_instance={owner}"},
    )


@router.get(
    path="/jobs/{job_id}",
    response_model=JobStatusModel,
    summary="Poll a running job",
)
async def get_job(
    request: Request,
    job_id: str,
    svc: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> JobStatusModel | Response:
    return _replay_to_owner(request, job_id) or svc.job(job_id)


@router.get(
    path="/jobs/{job_id}/result",
    response_model=OptimizeResult,
    summary="Fetch a finished job's result",
)
async def get_job_result(
    request: Request,
    job_id: str,
    svc: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> OptimizeResult | Response:
    return _replay_to_owner(request, job_id) or svc.job_result(job_id)


@router.delete(
    path="/jobs/{job_id}",
    response_model=JobStatusModel,
    summary="Stop a running job",
)
async def cancel_job(
    request: Request,
    job_id: str,
    svc: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> JobStatusModel | Response:
    """Asks the search to stop. It notices after its current configuration and
    reports `cancelled` once its cores are free; poll the job to see that land."""
    return _replay_to_owner(request, job_id) or svc.cancel_job(job_id)
