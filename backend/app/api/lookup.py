"""Lookup-table status — used by the frontend to show a banner when Redis is empty."""
from __future__ import annotations

import redis
from fastapi import APIRouter

from app.api.compatibility import MODELS
from app.config import settings
from app.serving.lookup import lookup_key

router = APIRouter()


@router.get("/lookup/status")
def lookup_status() -> dict:
    r = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        total_keys = r.dbsize()
    except redis.RedisError as exc:
        return {"populated": False, "key_count": 0, "error": str(exc)}

    # Per-model heuristic: probe the (0, 0) sentinel for each known model.
    per_model: dict[str, bool] = {}
    for m in MODELS:
        per_model[m] = bool(r.exists(lookup_key(m, 0, 0)))

    populated = all(per_model.values())
    return {
        "populated": populated,
        "key_count": int(total_keys),
        "per_model": per_model,
    }
