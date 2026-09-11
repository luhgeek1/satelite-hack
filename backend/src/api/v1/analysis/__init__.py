from fastapi import APIRouter


def get_analysis_router() -> APIRouter:
    from .jobs import router as jobs_router
    from .resilience import router as resilience_router

    router = APIRouter(tags=["analysis"])
    router.include_router(resilience_router)
    router.include_router(jobs_router)
    return router
