"""Stress-test endpoints.

Two flavours:
  POST /api/stress-test          synchronous, returns full latencies + percentiles
  GET  /api/stress-test/stream   SSE stream (GET because EventSource only supports GET)

Sample strategies:
  random   — true random sampling each invocation (different latencies each run)
  uniform  — deterministic per (model, method): seeded by hash so two consecutive runs
             produce comparable latency distributions
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncIterator, Literal

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.api.compatibility import is_compatible
from app.metrics.serving import get_metrics
from app.models_io.registry import get_store
from app.serving.factory import get_factory

logger = logging.getLogger("ml-prod-demo.stress")
router = APIRouter()

MAX_REQUESTS = 5000
PROGRESS_EVERY = 50

SampleStrategy = Literal["random", "uniform"]


class StressRequest(BaseModel):
    model: str
    method: str
    n_requests: int = Field(..., ge=1, le=MAX_REQUESTS)
    sample_strategy: SampleStrategy = "uniform"


class StressResponse(BaseModel):
    model: str
    method: str
    n_requests: int
    sample_strategy: str
    latencies_ms: list[float]
    p50: float
    p95: float
    p99: float
    errors: int
    misses: int
    hits: int


def _validate(model: str, method: str) -> None:
    compatible, reason = is_compatible(model, method)
    if not compatible:
        logger.info(
            "stress model=%s method=%s outcome=rejected reason=incompatible_combination detail=%r",
            model, method, reason,
        )
        raise HTTPException(
            status_code=400,
            detail={
                "error": "incompatible_combination",
                "model": model,
                "method": method,
                "reason": reason,
            },
        )


def _sample_pairs(
    n: int, strategy: SampleStrategy, model: str, method: str
) -> tuple[np.ndarray, np.ndarray]:
    store = get_store()
    n_users = store.n_users
    n_hotels = store.n_hotels
    if strategy == "uniform":
        # deterministic seed per (model, method) so repeated runs are comparable
        seed = abs(hash((model, method))) & 0xFFFFFFFF
        rng = np.random.default_rng(seed)
    else:
        rng = np.random.default_rng()  # entropy from OS
    user_ids = rng.integers(0, n_users, size=n).astype(np.int32)
    hotel_ids = rng.integers(0, n_hotels, size=n).astype(np.int32)
    return user_ids, hotel_ids


def _run_stress(
    model: str, method: str, n: int, strategy: SampleStrategy
) -> tuple[list[float], int, int, int]:
    """Run synchronously, return (latencies, hits, misses, errors)."""
    server = get_factory().get(model, method)
    user_ids, hotel_ids = _sample_pairs(n, strategy, model, method)
    latencies: list[float] = []
    hits = misses = errors = 0
    metrics = get_metrics()
    for uid, hid in zip(user_ids, hotel_ids):
        try:
            result = server.predict(int(uid), int(hid))
            latencies.append(result.latency_ms)
            if method == "lookup":
                if result.metadata.get("cache_hit"):
                    hits += 1
                    metrics.record(model, method, result.latency_ms, outcome="hit")
                else:
                    misses += 1
                    metrics.record(model, method, result.latency_ms, outcome="miss")
            else:
                hits += 1
                metrics.record(model, method, result.latency_ms, outcome="hit")
        except Exception:
            errors += 1
            metrics.record(model, method, 0.0, outcome="error")
            logger.exception(
                "stress_error model=%s method=%s user=%s hotel=%s", model, method, uid, hid
            )
    return latencies, hits, misses, errors


def _percentiles(latencies: list[float]) -> tuple[float, float, float]:
    if not latencies:
        return 0.0, 0.0, 0.0
    arr = np.asarray(latencies)
    return (
        float(np.percentile(arr, 50)),
        float(np.percentile(arr, 95)),
        float(np.percentile(arr, 99)),
    )


@router.post("/stress-test", response_model=StressResponse)
def stress_test(req: StressRequest) -> StressResponse:
    _validate(req.model, req.method)
    t0 = time.perf_counter()
    latencies, hits, misses, errors = _run_stress(
        req.model, req.method, req.n_requests, req.sample_strategy
    )
    p50, p95, p99 = _percentiles(latencies)
    logger.info(
        "stress model=%s method=%s n=%d strategy=%s p50=%.3fms p95=%.3fms p99=%.3fms "
        "hits=%d misses=%d errors=%d wall=%.2fs",
        req.model, req.method, req.n_requests, req.sample_strategy,
        p50, p95, p99, hits, misses, errors, time.perf_counter() - t0,
    )
    return StressResponse(
        model=req.model,
        method=req.method,
        n_requests=req.n_requests,
        sample_strategy=req.sample_strategy,
        latencies_ms=latencies,
        p50=p50, p95=p95, p99=p99,
        errors=errors, misses=misses, hits=hits,
    )


@router.get("/stress-test/stream")
async def stress_test_stream(
    model: str,
    method: str,
    n: int,
    sample_strategy: SampleStrategy = "uniform",
) -> EventSourceResponse:
    """SSE: emits {processed, total, latest_latency_ms} every PROGRESS_EVERY requests,
    plus a final 'done' event with percentiles. GET-only because EventSource is GET-only.
    """
    _validate(model, method)
    if n < 1 or n > MAX_REQUESTS:
        raise HTTPException(
            status_code=400, detail=f"n must be in [1, {MAX_REQUESTS}]"
        )
    server = get_factory().get(model, method)
    user_ids, hotel_ids = _sample_pairs(n, sample_strategy, model, method)
    metrics = get_metrics()

    async def event_gen() -> AsyncIterator[dict]:
        latencies: list[float] = []
        batch: list[float] = []
        hits = misses = errors = 0
        for i, (uid, hid) in enumerate(zip(user_ids, hotel_ids), start=1):
            try:
                result = server.predict(int(uid), int(hid))
                latencies.append(result.latency_ms)
                batch.append(result.latency_ms)
                if method == "lookup":
                    if result.metadata.get("cache_hit"):
                        hits += 1
                        metrics.record(model, method, result.latency_ms, outcome="hit")
                    else:
                        misses += 1
                        metrics.record(model, method, result.latency_ms, outcome="miss")
                else:
                    hits += 1
                    metrics.record(model, method, result.latency_ms, outcome="hit")
                if i % PROGRESS_EVERY == 0 or i == n:
                    yield {
                        "event": "progress",
                        "data": json.dumps(
                            {
                                "processed": i,
                                "total": n,
                                "latencies_ms": batch,
                                "hits": hits,
                                "misses": misses,
                                "errors": errors,
                            }
                        ),
                    }
                    batch = []
                    # let the loop hand off; keep stream responsive
                    await asyncio.sleep(0)
            except Exception as exc:
                errors += 1
                metrics.record(model, method, 0.0, outcome="error")
                logger.exception("stream_error i=%d", i)
                yield {
                    "event": "error",
                    "data": json.dumps({"i": i, "error": str(exc)}),
                }
        p50, p95, p99 = _percentiles(latencies)
        yield {
            "event": "done",
            "data": json.dumps(
                {
                    "p50": p50, "p95": p95, "p99": p99,
                    "hits": hits, "misses": misses, "errors": errors,
                    "n_requests": n, "model": model, "method": method,
                }
            ),
        }

    return EventSourceResponse(event_gen())
