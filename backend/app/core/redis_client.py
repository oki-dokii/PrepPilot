"""
Redis client — used for session state caching and distributed locks.
Gracefully degrades when Redis is unavailable (returns None / no-ops).
"""
import logging
import json
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)
_redis_pool: aioredis.Redis | None = None
_redis_unavailable = False


async def get_redis() -> aioredis.Redis | None:
    global _redis_pool, _redis_unavailable
    if _redis_unavailable:
        return None
    if _redis_pool is None:
        try:
            _redis_pool = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
            )
            await _redis_pool.ping()
        except Exception as e:
            logger.warning(f"Redis unavailable ({e}). Running without cache.")
            _redis_pool = None
            _redis_unavailable = True
    return _redis_pool


# ─── Session helpers ─────────────────────────────────────────────────────────

async def cache_session(session_id: str, data: dict, ttl_seconds: int = 7200):
    r = await get_redis()
    if not r:
        return
    try:
        await r.setex(f"session:{session_id}", ttl_seconds, json.dumps(data))
    except Exception:
        pass


async def get_cached_session(session_id: str) -> dict | None:
    r = await get_redis()
    if not r:
        return None
    try:
        raw = await r.get(f"session:{session_id}")
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def invalidate_session(session_id: str):
    r = await get_redis()
    if not r:
        return
    try:
        await r.delete(f"session:{session_id}")
    except Exception:
        pass


async def set_grading_status(session_id: str, status: str):
    r = await get_redis()
    if not r:
        return
    try:
        await r.setex(f"grading:{session_id}", 3600, status)
    except Exception:
        pass


async def get_grading_status(session_id: str) -> str | None:
    r = await get_redis()
    if not r:
        return None
    try:
        return await r.get(f"grading:{session_id}")
    except Exception:
        return None
