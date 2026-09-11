from fastapi import APIRouter


def get_v1_router() -> APIRouter:
    from .analysis import get_analysis_router
    from .scenarios import get_scenarios_router
    from .simulations import get_simulations_router
    from .variants import get_variants_router

    router = APIRouter(prefix="/v1")
    router.include_router(get_scenarios_router())
    router.include_router(get_simulations_router())
    router.include_router(get_variants_router())
    router.include_router(get_analysis_router())
    return router
