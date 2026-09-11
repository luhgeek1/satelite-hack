"""Application entry point.

Deliberately lean compared with the template it grew from: no auth, no object
storage, no scheduler, no message broker. The jury opens a URL and has to be able
to use the tool immediately, so every moving part that could fail in front of
them and buys no points was left out.
"""

import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from api import get_api_routers
from core.config import Settings, configure_logging, get_settings
from core.error_handling import register_exception_handlers
from core.middlewares import RequestTracingMiddleware
from database.redis import close_redis, init_redis
from database.relational_db import dispose_engine, get_session_factory, wait_for_db

logger = logging.getLogger(__name__)


def create_app(
    settings: Settings | None = None,
    *,
    check_db_on_startup: bool = True,
    seed_scenarios: bool | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            if check_db_on_startup:
                await wait_for_db()

            init_redis(settings)

            should_seed = (
                settings.SCENARIO_SEED_ENABLED if seed_scenarios is None else seed_scenarios
            )
            if should_seed and check_db_on_startup:
                await _seed_scenarios()

            yield
        finally:
            await close_redis()
            await dispose_engine()

    app = FastAPI(
        lifespan=lifespan,
        title="OrbitGuard API",
        version=settings.APP_VERSION,
        summary="Constellation resilience studio for the КосмоХакатон 2026 case",
        description=(
            "Loads `cosmo-A-1.0` scenarios, simulates a constellation over its time grid, "
            "routes traffic from client sites to a gateway, and reports availability, "
            "outages and per-satellite criticality.\n\n"
            "**Conventions.** Times are seconds from the start of the run (`t_s`), angles are "
            "degrees, distances kilometres, fractions are 0…1 (not percent). Keys are "
            "`snake_case`, matching the official case format."
        ),
        debug=settings.DEBUG if settings.DEBUG is not None else settings.APP_STAGE == "dev",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(RequestTracingMiddleware)
    if settings.cors_origins or settings.CORS_ALLOW_ORIGIN_REGEX:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_origin_regex=settings.CORS_ALLOW_ORIGIN_REGEX or None,
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-ID", "X-Process-Time-Ms", "Content-Disposition"],
        )

    register_exception_handlers(app, settings)
    app.include_router(get_api_routers())

    @app.get("/api/ping", tags=["meta"])
    async def ping():
        return {"status": "ok"}

    @app.get("/api/health", tags=["meta"])
    async def health():
        dependencies: dict[str, str] = {}

        try:
            session_factory = get_session_factory(settings)
            async with session_factory() as session:
                await session.execute(text("SELECT 1"))
            dependencies["database"] = "ok"
        except Exception as exc:
            logger.warning("Database health check failed: %s", exc)
            dependencies["database"] = "error"

        try:
            redis = init_redis(settings)
            await redis.ping()
            dependencies["redis"] = "ok"
        except Exception as exc:
            logger.warning("Redis health check failed: %s", exc)
            dependencies["redis"] = "degraded"

        # Redis is a cache; losing it slows the service down but does not break
        # it, so it never turns the overall status red.
        critical_ok = dependencies.get("database") == "ok"
        return {
            "status": "ok"
            if critical_ok and "degraded" not in dependencies.values()
            else ("degraded" if critical_ok else "error"),
            "timestamp": datetime.now(UTC).isoformat(),
            "version": settings.APP_VERSION,
            "dependencies": dependencies,
        }

    @app.get("/api/ready", tags=["meta"])
    async def readiness():
        try:
            session_factory = get_session_factory(settings)
            async with session_factory() as session:
                await session.execute(text("SELECT 1"))
        except Exception as exc:
            logger.warning("Readiness check failed: %s", exc)
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"status": "not_ready", "checks": {"database": "error"}},
            )
        return {"status": "ready", "checks": {"database": "ok"}}

    return app


async def _seed_scenarios() -> None:
    """Load the bundled case scenarios. Never fatal — an upload still works."""
    from database.redis import CacheRepo
    from database.redis import init_redis as _init_redis
    from database.relational_db import ScenarioInterface, UoW
    from database.relational_db import get_session_factory as _factory
    from service.scenarios.service import ScenarioService

    try:
        session_factory = _factory()
        async with session_factory() as session, UoW(session) as uow:
            service = ScenarioService(
                uow=uow,
                scenarios=ScenarioInterface(uow.session),
                cache=CacheRepo(_init_redis()),
            )
            await service.seed_official()
    except Exception as exc:
        logger.warning("Scenario seeding failed, continuing without it: %s", exc)


app = create_app()
