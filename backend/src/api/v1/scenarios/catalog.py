from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from domain.scenario import ScenarioDetail, ScenarioRenameRequest, ScenarioSummary, SiteProfileModel
from engine import PROFILES
from service.scenarios import ScenarioService, get_scenario_service

router = APIRouter()


@router.get(
    path="/scenarios/site-profiles",
    response_model=list[SiteProfileModel],
    summary="Named surroundings profiles for ground sites, with their default masks",
)
async def list_site_profiles() -> list[SiteProfileModel]:
    return [
        SiteProfileModel(
            id=profile.id,
            mask_deg=profile.mask_deg,
            altitude_m=profile.altitude_m,
            rationale=profile.rationale,
        )
        for profile in PROFILES.values()
    ]


@router.get(
    path="/scenarios",
    response_model=list[ScenarioSummary],
    summary="List available scenarios",
)
async def list_scenarios(
    svc: Annotated[ScenarioService, Depends(get_scenario_service)],
) -> list[ScenarioSummary]:
    return await svc.list()


@router.get(
    path="/scenarios/{scenario_id}",
    response_model=ScenarioDetail,
    summary="Fetch one scenario with its original document",
)
async def get_scenario(
    scenario_id: str,
    svc: Annotated[ScenarioService, Depends(get_scenario_service)],
) -> ScenarioDetail:
    return await svc.get(scenario_id)


@router.get(
    path="/scenarios/{scenario_id}/download",
    summary="Download the scenario as the original cosmo-A-1.0 file",
)
async def download_scenario(
    scenario_id: str,
    svc: Annotated[ScenarioService, Depends(get_scenario_service)],
) -> Response:
    payload = await svc.payload(scenario_id)
    import orjson

    return Response(
        content=orjson.dumps(payload, option=orjson.OPT_INDENT_2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{scenario_id}.json"'},
    )


@router.delete(
    path="/scenarios/{scenario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an imported scenario",
)
async def delete_scenario(
    scenario_id: str,
    svc: Annotated[ScenarioService, Depends(get_scenario_service)],
) -> None:
    await svc.delete(scenario_id)


@router.patch(
    path="/scenarios/{scenario_id}",
    response_model=ScenarioSummary,
    summary="Rename an imported scenario",
)
async def rename_scenario(
    scenario_id: str,
    request: ScenarioRenameRequest,
    svc: Annotated[ScenarioService, Depends(get_scenario_service)],
) -> ScenarioSummary:
    return await svc.rename(scenario_id, request.title)
