from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from domain.analysis import JobStatusModel, OptimizeResult
from service.analysis import AnalysisService, get_analysis_service
from service.analysis.jobs import owner_of, this_machine

router = APIRouter()

_REPLAYED = "fly-replay-src"


def _replay_to_owner(request: Request, job_id: str) -> Response | None:
    if _REPLAYED in request.headers:
        return None

    owner = owner_of(job_id)
    if owner is None or owner == this_machine():
        return None

    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
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
