from fastapi import Depends

from database.redis import CacheRepo, get_redis
from database.relational_db import ScenarioInterface, UoW, get_uow

from .service import ScenarioService


async def get_scenario_service(
    uow: UoW = Depends(get_uow),
    redis=Depends(get_redis),
) -> ScenarioService:
    return ScenarioService(
        uow=uow,
        scenarios=ScenarioInterface(uow.session),
        cache=CacheRepo(redis),
    )


__all__ = ["ScenarioService", "get_scenario_service"]
