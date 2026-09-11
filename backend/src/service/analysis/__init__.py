from fastapi import Depends

from database.redis import CacheRepo, get_redis
from database.relational_db import ScenarioInterface, UoW, get_uow

from .jobs import JobRegistry, get_job_registry
from .service import AnalysisService


async def get_analysis_service(
    uow: UoW = Depends(get_uow),
    redis=Depends(get_redis),
    jobs: JobRegistry = Depends(get_job_registry),
) -> AnalysisService:
    return AnalysisService(
        uow=uow,
        scenarios=ScenarioInterface(uow.session),
        cache=CacheRepo(redis),
        jobs=jobs,
    )


__all__ = ["AnalysisService", "JobRegistry", "get_analysis_service", "get_job_registry"]
