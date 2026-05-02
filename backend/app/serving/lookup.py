from __future__ import annotations

import time
from typing import Iterator

import redis

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


class LookupServer(Server):
    method_name = "lookup"

    def __init__(self, model_name: str, redis_url: str | None = None) -> None:
        self.model_name = model_name
        self._redis: redis.Redis = redis.Redis.from_url(
            redis_url or settings.redis_url, decode_responses=True
        )

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
            probability=float(raw),
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

    def _scan_keys(self) -> Iterator[str]:
        return self._redis.scan_iter(
            match=f"{KEY_PREFIX}:{self.model_name}:*", count=1000
        )
