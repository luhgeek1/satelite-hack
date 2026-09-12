"""Application settings.

Deliberately smaller than the template's: this service has no users, no uploads
and no external ML, so the auth/storage/notification blocks were dropped rather
than carried along switched off. Authentication is out of scope on purpose — the
jury opens a URL and must be able to use the tool immediately.
"""

import logging
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=f"{BASE_DIR}/.env", extra="ignore")

    APP_STAGE: Literal["dev", "prod"] = "dev"
    APP_VERSION: str = "dev"
    DEBUG: bool | None = None
    LOG_LEVEL: str = "INFO"
    SQL_ECHO: bool = False

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8080

    CORS_ALLOW_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    CORS_ALLOW_ORIGIN_REGEX: str = ""

    DATABASE_URL: str = "postgresql+asyncpg://postgres:secret@localhost:5432/orbitguard"
    REDIS_URL: str = "redis://localhost:6379/0"

    # Seeded from `SCENARIO_SEED_DIR` on startup so a fresh deployment always has
    # the four official scenarios available without an import step.
    SCENARIO_SEED_DIR: str = str(BASE_DIR.parent / "data")
    SCENARIO_SEED_ENABLED: bool = True

    # Guard rails for scenarios the jury uploads: the official validator already
    # caps the horizon at 48 h, this caps the work a single request can cause.
    MAX_SCENARIO_BYTES: int = 8 * 1024 * 1024
    MAX_SIMULATION_STEPS: int = 8_640
    MAX_SATELLITES: int = 500

    # A resilience or sensitivity sweep pins every core it is given for tens of
    # seconds, and each request opens its own process pool. Letting an unbounded
    # number run at once is what turned a 20 s sweep into an 832 s one in
    # production: twenty pools on two cores starve each other, requests queue,
    # the client retries, and the queue grows faster than it drains.
    MAX_CONCURRENT_ANALYSES: int = 2

    # Enough headroom that a slow analysis cannot starve the cheap endpoints.
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Worker counts for the fan-out analyses. `None` lets the pool decide.
    ANALYSIS_MAX_WORKERS: int | None = None
    OPTIMIZER_MAX_WORKERS: int | None = None

    # The most configurations one search may evaluate. Each is a full day of
    # simulation, about 0.45 s on the production machine's two cores, so this is
    # a ceiling of roughly seven and a half minutes: the thorough preset (a
    # standard six-axis search is 676 runs) fits, the exhaustive grid (4 109)
    # does not, and neither does a hand-written request that asks for more.
    OPTIMIZER_MAX_RUNS: int = 1_000

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]

    @field_validator("ANALYSIS_MAX_WORKERS", "OPTIMIZER_MAX_WORKERS", mode="before")
    @classmethod
    def _blank_means_auto(cls, value: int | str | None) -> int | None:
        """An empty entry in `.env` means "let the pool size itself", not zero."""
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return value

    @field_validator("DEBUG", mode="before")
    @classmethod
    def _normalize_debug(cls, value: bool | str | None) -> bool | None:
        if value is None or isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()


def configure_logging(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s [%(filename)s:%(lineno)d] %(message)s",
    )
