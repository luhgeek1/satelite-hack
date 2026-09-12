from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response

from domain.simulation import (
    AvailabilitySample,
    EphemerisResponse,
    RouteTimelineResponse,
    RunRequest,
    SimulationSummary,
    SnapshotResponse,
)
from service.simulations import SimulationService, get_simulation_service

router = APIRouter()


@router.post(
    path="/simulations",
    response_model=SimulationSummary,
    summary="Run a scenario over its full time grid",
)
async def run_simulation(
    request: RunRequest,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> SimulationSummary:
    return await svc.run(request)


@router.get(
    path="/simulations/{run_id}",
    response_model=SimulationSummary,
    summary="Fetch a completed run",
)
async def get_simulation(
    run_id: str,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> SimulationSummary:
    return await svc.summary(run_id)


@router.get(
    path="/simulations/{run_id}/snapshot",
    response_model=SnapshotResponse,
    summary="Network state at one instant",
)
async def get_snapshot(
    run_id: str,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
    t_s: Annotated[int, Query(ge=0, description="Seconds from the start of the run")] = 0,
) -> SnapshotResponse:
    return await svc.snapshot(run_id, t_s)


@router.get(
    path="/simulations/{run_id}/ephemeris",
    response_model=EphemerisResponse,
    summary="Satellite positions across the whole horizon",
)
async def get_ephemeris(
    run_id: str,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
    step_s: Annotated[
        int | None,
        Query(gt=0, description="Coarsen the sampling; never finer than the scenario grid"),
    ] = None,
) -> EphemerisResponse:
    return await svc.ephemeris(run_id, step_s)


@router.get(
    path="/simulations/{run_id}/availability",
    response_model=list[AvailabilitySample],
    summary="Per-instant availability states for the timeline strip",
)
async def get_availability(
    run_id: str,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> list[AvailabilitySample]:
    return await svc.availability_series(run_id)


@router.get(
    path="/simulations/{run_id}/routes/{client_id}",
    response_model=RouteTimelineResponse,
    summary="Every instant's route for one client",
)
async def get_routes(
    run_id: str,
    client_id: str,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> RouteTimelineResponse:
    return await svc.route_timeline(run_id, client_id)


@router.get(
    path="/simulations/{run_id}/export",
    summary="Download the official cosmo-A-result-1.0 document",
)
async def export_result(
    run_id: str,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> Response:
    payload = await svc.export(run_id)
    import orjson

    return Response(
        content=orjson.dumps(payload, option=orjson.OPT_INDENT_2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{run_id}_result.json"'},
    )


@router.get(
    path="/simulations/{run_id}/scenario",
    summary="Download the effective scenario this run used",
)
async def download_effective_scenario(
    run_id: str,
    svc: Annotated[SimulationService, Depends(get_simulation_service)],
) -> Response:
    payload: dict[str, Any] = await svc.effective_scenario(run_id)
    import orjson

    return Response(
        content=orjson.dumps(payload, option=orjson.OPT_INDENT_2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{run_id}_scenario.json"'},
    )
