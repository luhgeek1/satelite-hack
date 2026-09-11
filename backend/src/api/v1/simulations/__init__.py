from fastapi import APIRouter


def get_simulations_router() -> APIRouter:
    from .runs import router as runs_router

    router = APIRouter(tags=["simulations"])
    router.include_router(runs_router)
    return router
