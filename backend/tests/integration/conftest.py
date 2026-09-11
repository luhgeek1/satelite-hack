"""Integration fixtures: the real app against throwaway Postgres and Redis.

Bring the infrastructure up with `make test-up` (docker-compose.test.yml) before
running these. They are marked `integration` so `pytest -m unit` stays infra-free.
"""

import os
from pathlib import Path

import pytest_asyncio

REPO_ROOT = Path(__file__).resolve().parents[3]

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://postgres:secret@localhost:55432/orbitguard_test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:56379/0")
os.environ.setdefault("SCENARIO_SEED_DIR", str(REPO_ROOT / "data"))


@pytest_asyncio.fixture
async def client():
    from httpx import ASGITransport, AsyncClient

    from core.config import clear_settings_cache
    from database.relational_db import dispose_engine
    from main import create_app

    clear_settings_cache()
    app = create_app(check_db_on_startup=True, seed_scenarios=True)

    async with (
        AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http_client,
        app.router.lifespan_context(app),
    ):
        yield http_client

    await dispose_engine()
