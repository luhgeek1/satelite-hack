from typing import Annotated

from fastapi import APIRouter, Depends, status

from domain.analysis import CompareRequest, CompareResponse, VariantCreate, VariantModel
from service.simulations import SimulationService, get_simulation_service

router = APIRouter()


@router.post(
    path="/variants",
    response_model=VariantModel,
    status_code=status.HTTP_201_CREATED,
    summary="Save the current configuration as a named variant",
)
async def create_variant(
    request: VariantCreate,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> VariantModel:
    return await svc.save_variant(request)


@router.get(
    path="/variants",
    response_model=list[VariantModel],
    summary="List saved variants",
)
async def list_variants(
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> list[VariantModel]:
    return await svc.list_variants()


@router.post(
    path="/variants/compare",
    response_model=CompareResponse,
    summary="Compare saved variants side by side",
)
async def compare_variants(
    request: CompareRequest,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> CompareResponse:
    return await svc.compare(request.variant_ids)


@router.delete(
    path="/variants/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a saved variant",
)
async def delete_variant(
    variant_id: str,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> None:
    await svc.delete_variant(variant_id)
