from __future__ import annotations

import struct
import time
from typing import Iterator

import redis

# Each value in Redis is 8 raw bytes: little-endian IEEE-754 double.
# Saves the cost of bytes→str→float on every GET (~5-10us in Python).
_PACK = struct.Struct("<d")

from app.config import settings
from app.serving.base import PredictionResult, RadarAxes, Server

# Static axes for Lookup, per CLAUDE.md §8.
STATIC_AXES = RadarAxes(
    modeling_flexibility=1.0,
    input_space_flexibility=-1.0,
    stack_flexibility=1.0,
    consistency=0.0,
    observability=1.0,
)

KEY_PREFIX = "pred"


def lookup_key(model_name: str, user_id: int, hotel_id: int) -> str:
    return f"{KEY_PREFIX}:{model_name}:{user_id}:{hotel_id}"


_shared_client: redis.Redis | None = None


def get_redis_client() -> redis.Redis:
    """Single Redis client reused across all LookupServer instances.

    `socket_keepalive=True` keeps the TCP connection open across idle periods,
    avoiding the kernel's silent connection drop and the resulting reconnect cost
    on the next GET. `decode_responses=False` keeps responses as bytes — we either
    decode strings ourselves or unpack binary floats (see Paso 2d).
    """
    global _shared_client
    if _shared_client is None:
        _shared_client = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=False,
            socket_keepalive=True,
            socket_connect_timeout=2,
            health_check_interval=30,
        )
    return _shared_client


class LookupServer(Server):
    method_name = "lookup"

    def __init__(self, model_name: str, redis_client: redis.Redis | None = None) -> None:
        self.model_name = model_name
        self._redis: redis.Redis = redis_client or get_redis_client()

    def predict(self, user_id: int, hotel_id: int) -> PredictionResult:
        key = lookup_key(self.model_name, user_id, hotel_id)
        t0 = time.perf_counter()
        raw = self._redis.get(key)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        if raw is None:
            return PredictionResult(
                probability=None,
                latency_ms=latency_ms,
                metadata={"cache_hit": False, "key": key},
            )
        return PredictionResult(
            probability=_PACK.unpack(raw)[0],
            latency_ms=latency_ms,
            metadata={"cache_hit": True, "key": key},
        )

    def artifact_size_bytes(self) -> int:
        """Approximate: total Redis used_memory.

        Labelled as approximation in the API; the demo only needs an order of magnitude.
        """
        info = self._redis.info("memory")
        return int(info.get("used_memory", 0))

    @property
    def static_axes(self) -> RadarAxes:
        return STATIC_AXES

    def is_populated(self) -> bool:
        # Cheap heuristic: check the (0,0) sentinel for this model.
        return bool(self._redis.exists(lookup_key(self.model_name, 0, 0)))

    def key_count(self, sample_limit: int = 100_000) -> int:
        """Count keys for this model. Caps work to avoid blocking on huge stores."""
        count = 0
        for _ in self._scan_keys():
            count += 1
            if count >= sample_limit:
                break
        return count

    def _scan_keys(self) -> Iterator[bytes]:
        return self._redis.scan_iter(
            match=f"{KEY_PREFIX}:{self.model_name}:*", count=1000
        )
