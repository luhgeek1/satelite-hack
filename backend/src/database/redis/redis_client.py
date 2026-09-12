from __future__ import annotations

import logging

from redis.asyncio import Redis, from_url

from core.config import Settings, get_settings

logger = logging.getLogger(__name__)

_redis: Redis | None = None


def init_redis(settings: Settings | None = None) -> Redis:
    global _redis
    if _redis is None:
        settings = settings or get_settings()
        _redis = from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=False)
    return _redis


async def get_redis() -> Redis:
    return init_redis()


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
    _redis = None
