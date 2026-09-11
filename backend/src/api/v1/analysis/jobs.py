"""Job status for the optimizer."""

from typing import Annotated

from fastapi import APIRouter, Depends

from domain.analysis import JobStatusModel, OptimizeResult
from service.analysis import AnalysisService, get_analysis_service

router = APIRouter()


@router.get(
    path="/jobs/{job_id}",
    response_model=JobStatusModel,
    summary="Poll a running job",
)
async def get_job(
    job_id: str,
    svc: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> JobStatusModel:
    return svc.job(job_id)


@router.get(
    path="/jobs/{job_id}/result",
    response_model=OptimizeResult,
    summary="Fetch a finished job's result",
)
async def get_job_result(
    job_id: str,
    svc: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> OptimizeResult:
    return svc.job_result(job_id)
