from typing import Annotated

from fastapi import APIRouter, Depends, status

from domain.analysis import (
    JobStatusModel,
    OptimizeRequest,
    ResilienceRequest,
    ResilienceResponse,
    SensitivityRequest,
    SensitivityResponse,
)
from service.analysis import AnalysisService, get_analysis_service

router = APIRouter()


@router.post(
    path="/analysis/resilience",
    response_model=ResilienceResponse,
    summary="Rank satellites by the availability lost if they fail",
)
async def analyse_resilience(
    request: ResilienceRequest,
    svc: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> ResilienceResponse:
    return await svc.resilience(request)


@router.post(
    path="/analysis/sensitivity",
    response_model=SensitivityResponse,
    summary="Sweep an environment parameter to locate the target threshold",
)
async def analyse_sensitivity(
    request: SensitivityRequest,
    svc: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> SensitivityResponse:
    return await svc.sensitivity(request)


@router.post(
    path="/analysis/optimize",
    response_model=JobStatusModel,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Search for a better plane configuration",
)
async def start_optimization(
    request: OptimizeRequest,
    svc: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> JobStatusModel:
    return await svc.start_optimization(request)
