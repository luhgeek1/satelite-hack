from fastapi import APIRouter


def get_scenarios_router() -> APIRouter:
    from .catalog import router as catalog_router
    from .imports import router as imports_router

    router = APIRouter(tags=["scenarios"])
    router.include_router(imports_router)
    router.include_router(catalog_router)
    return router
