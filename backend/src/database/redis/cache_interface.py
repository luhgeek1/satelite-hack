"""Best-effort cache for computed snapshots and ephemerides.

Every miss — including "Redis is unreachable" — just means recomputing, which
costs milliseconds. So nothing here raises: a cache that can take the service
down is worse than no cache.
"""

from __future__ import annotations

import logging
import zlib
from typing import Any

import orjson
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

DEFAULT_TTL_S = 3600


class CacheRepo:
    def __init__(self, redis: Redis | None) -> None:
        self.redis = redis

    async def get_json(self, key: str) -> Any | None:
        if self.redis is None:
            return None
        try:
            blob = await self.redis.get(key)
        except RedisError as exc:
            logger.warning("Cache read failed for %s: %s", key, exc)
            return None
        if blob is None:
            return None
        try:
            return orjson.loads(zlib.decompress(blob))
        except (zlib.error, orjson.JSONDecodeError) as exc:
            logger.warning("Discarding unreadable cache entry %s: %s", key, exc)
            return None

    async def set_json(self, key: str, value: Any, ttl_s: int = DEFAULT_TTL_S) -> None:
        if self.redis is None:
            return
        try:
            await self.redis.set(key, zlib.compress(orjson.dumps(value), 1), ex=ttl_s)
        except RedisError as exc:
            logger.warning("Cache write failed for %s: %s", key, exc)

    async def drop_prefix(self, prefix: str) -> None:
        if self.redis is None:
            return
        try:
            async for key in self.redis.scan_iter(match=f"{prefix}*", count=500):
                await self.redis.delete(key)
        except RedisError as exc:
            logger.warning("Cache invalidation failed for %s: %s", prefix, exc)
