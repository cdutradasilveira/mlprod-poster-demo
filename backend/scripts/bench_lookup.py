"""Micro-benchmark for the LookupServer.

Runs N back-to-back GETs against Redis through the production LookupServer code
(no batching, no pipelining — same path the API takes for a single /api/predict).
Reports p50/p95/p99 in microseconds and milliseconds.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.serving.lookup import LookupServer  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="logreg")
    parser.add_argument("--n", type=int, default=1000)
    parser.add_argument("--warmup", type=int, default=200)
    args = parser.parse_args()

    server = LookupServer(args.model)
    # Warm the connection pool + page cache.
    for _ in range(args.warmup):
        server.predict(0, 0)

    # Use deterministic key pattern so we always hit a populated combo.
    user_ids = [(i * 7) % 1000 for i in range(args.n)]
    hotel_ids = [(i * 13) % 500 for i in range(args.n)]

    latencies_ms: list[float] = []
    misses = 0
    t_wall = time.perf_counter()
    for u, h in zip(user_ids, hotel_ids):
        result = server.predict(u, h)
        latencies_ms.append(result.latency_ms)
        if result.probability is None:
            misses += 1
    wall = time.perf_counter() - t_wall

    arr = np.asarray(latencies_ms)
    p50 = float(np.percentile(arr, 50))
    p95 = float(np.percentile(arr, 95))
    p99 = float(np.percentile(arr, 99))
    mean = float(arr.mean())
    print(
        f"model={args.model}  n={args.n}  warmup={args.warmup}  misses={misses}  "
        f"wall={wall * 1000:.1f}ms"
    )
    print(
        f"  latency  mean={mean * 1000:.1f}us  p50={p50 * 1000:.1f}us  "
        f"p95={p95 * 1000:.1f}us  p99={p99 * 1000:.1f}us"
    )


if __name__ == "__main__":
    main()
