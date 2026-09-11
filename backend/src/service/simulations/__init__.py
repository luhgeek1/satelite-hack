from fastapi import Depends

from database.redis import CacheRepo, get_redis
from database.relational_db import (
    ScenarioInterface,
    SimulationRunInterface,
    UoW,
    VariantInterface,
    get_uow,
)

from .service import SimulationService


async def get_simulation_service(
    uow: UoW = Depends(get_uow),
    redis=Depends(get_redis),
) -> SimulationService:
    return SimulationService(
        uow=uow,
        scenarios=ScenarioInterface(uow.session),
        runs=SimulationRunInterface(uow.session),
        variants=VariantInterface(uow.session),
        cache=CacheRepo(redis),
    )


__all__ = ["SimulationService", "get_simulation_service"]
