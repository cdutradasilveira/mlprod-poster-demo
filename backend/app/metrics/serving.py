from __future__ import annotations

import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Iterable

import numpy as np

WINDOW = 5000


@dataclass
class MethodStats:
    latencies: deque = field(default_factory=lambda: deque(maxlen=WINDOW))
    total_requests: int = 0
    hits: int = 0
    misses: int = 0
    errors: int = 0

    def percentile(self, p: float) -> float | None:
        if not self.latencies:
            return None
        return float(np.percentile(np.asarray(self.latencies), p))

    def snapshot(self) -> dict:
        if not self.latencies:
            p50 = p95 = p99 = None
        else:
            arr = np.asarray(self.latencies)
            p50, p95, p99 = (float(np.percentile(arr, q)) for q in (50, 95, 99))
        return {
            "total_requests": self.total_requests,
            "hits": self.hits,
            "misses": self.misses,
            "errors": self.errors,
            "p50_ms": p50,
            "p95_ms": p95,
            "p99_ms": p99,
            "n_latencies": len(self.latencies),
        }


class ServingMetrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stats: dict[tuple[str, str], MethodStats] = defaultdict(MethodStats)

    def record(self, model: str, method: str, latency_ms: float, *, outcome: str) -> None:
        with self._lock:
            s = self._stats[(model, method)]
            s.total_requests += 1
            s.latencies.append(latency_ms)
            if outcome == "hit":
                s.hits += 1
            elif outcome == "miss":
                s.misses += 1
            elif outcome == "error":
                s.errors += 1

    def latencies(self, model: str, method: str) -> list[float]:
        with self._lock:
            return list(self._stats[(model, method)].latencies)

    def snapshot(self, model: str, method: str) -> dict:
        with self._lock:
            return self._stats[(model, method)].snapshot()

    def all_snapshots(self) -> dict[str, dict]:
        with self._lock:
            return {f"{m}:{me}": s.snapshot() for (m, me), s in self._stats.items()}

    def reset(self) -> None:
        with self._lock:
            self._stats.clear()


_metrics = ServingMetrics()


def get_metrics() -> ServingMetrics:
    return _metrics


def histogram(latencies: Iterable[float], bins: list[float] | None = None) -> dict:
    """Build a histogram with fine bins below 5ms and wider bins above (good for the
    Lookup vs GLM resolution requirement in Phase 5)."""
    arr = np.asarray(list(latencies), dtype=np.float64)
    if bins is None:
        fine = np.arange(0.0, 5.01, 0.1)
        coarse = np.array([6.0, 8.0, 10.0, 15.0, 20.0, 30.0, 50.0, 100.0])
        edges = np.concatenate([fine, coarse])
    else:
        edges = np.asarray(bins, dtype=np.float64)
    counts, _ = np.histogram(arr, bins=edges)
    return {"bin_edges": edges.tolist(), "counts": counts.astype(int).tolist()}
