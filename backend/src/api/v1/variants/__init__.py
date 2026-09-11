from fastapi import APIRouter


def get_variants_router() -> APIRouter:
    from .crud import router as crud_router

    router = APIRouter(tags=["variants"])
    router.include_router(crud_router)
    return router
