from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, File, Query, UploadFile, status

from core.config import get_settings
from core.errors import PayloadTooLargeError, ScenarioValidationError
from domain.scenario import ScenarioSummary, ValidationReport
from service.scenarios import ScenarioService, get_scenario_service

router = APIRouter()


@router.post(
    path="/scenarios/validate",
    response_model=ValidationReport,
    summary="Check a scenario without storing it",
)
async def validate_scenario(
    svc: Annotated[ScenarioService, Depends(get_scenario_service)],
    payload: Annotated[dict[str, Any], Body(...)],
) -> ValidationReport:
    return svc.validate(payload)


@router.post(
    path="/scenarios",
    response_model=ScenarioSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Import a scenario from a JSON body",
)
async def import_scenario(
    svc: Annotated[ScenarioService, Depends(get_scenario_service)],
    payload: Annotated[dict[str, Any], Body(...)],
    scenario_id: Annotated[str | None, Query(max_length=128)] = None,
    overwrite: Annotated[bool, Query()] = False,
) -> ScenarioSummary:
    return await svc.import_scenario(payload, scenario_id=scenario_id, overwrite=overwrite)


@router.post(
    path="/scenarios/upload",
    response_model=ScenarioSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Import a scenario from an uploaded file",
)
async def upload_scenario(
    svc: Annotated[ScenarioService, Depends(get_scenario_service)],
    file: Annotated[UploadFile, File(...)],
    scenario_id: Annotated[str | None, Query(max_length=128)] = None,
    overwrite: Annotated[bool, Query()] = False,
) -> ScenarioSummary:
    settings = get_settings()
    raw = await file.read()

    if len(raw) > settings.MAX_SCENARIO_BYTES:
        raise PayloadTooLargeError(
            f"File is {len(raw)} bytes, limit is {settings.MAX_SCENARIO_BYTES}"
        )

    import orjson

    try:
        payload = orjson.loads(raw)
    except orjson.JSONDecodeError as exc:
        raise ScenarioValidationError(f"File is not valid JSON: {exc}", field="<file>") from exc

    return await svc.import_scenario(payload, scenario_id=scenario_id, overwrite=overwrite)
