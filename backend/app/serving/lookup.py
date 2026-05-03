from __future__ import annotations

import time
from pathlib import Path

import numpy as np

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

LOOKUP_SUBDIR = "lookup"


def _lookup_path(model_name: str) -> Path:
    return settings.artifacts_dir / LOOKUP_SUBDIR / f"{model_name}.npy"


# Module-level cache: model_name → float64 array shape (n_users, n_hotels).
# None means not yet attempted. Empty dict means attempted but no files found.
_tables: dict[str, np.ndarray] | None = None


def get_lookup_tables() -> dict[str, np.ndarray]:
    """Load lookup arrays from disk on first call (lazy, cached after first hit)."""
    global _tables
    if _tables is not None:
        return _tables
    lookup_dir = settings.artifacts_dir / LOOKUP_SUBDIR
    if not lookup_dir.exists():
        return {}  # not cached — dir may appear after populate_lookup runs
    tables: dict[str, np.ndarray] = {}
    for p in sorted(lookup_dir.glob("*.npy")):
        tables[p.stem] = np.load(str(p))
    if tables:
        _tables = tables
    return tables


class LookupServer(Server):
    method_name = "lookup"

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name

    def predict(self, user_id: int, hotel_id: int) -> PredictionResult:
        t0 = time.perf_counter()
        tables = get_lookup_tables()
        table = tables.get(self.model_name)
        if table is None or user_id >= table.shape[0] or hotel_id >= table.shape[1]:
            latency_ms = (time.perf_counter() - t0) * 1000.0
            return PredictionResult(
                probability=None,
                latency_ms=latency_ms,
                metadata={"cache_hit": False},
            )
        val = table[user_id, hotel_id]
        latency_ms = (time.perf_counter() - t0) * 1000.0
        if np.isnan(val):
            return PredictionResult(
                probability=None,
                latency_ms=latency_ms,
                metadata={"cache_hit": False},
            )
        return PredictionResult(
            probability=float(val),
            latency_ms=latency_ms,
            metadata={"cache_hit": True},
        )

    def artifact_size_bytes(self) -> int:
        p = _lookup_path(self.model_name)
        return p.stat().st_size if p.exists() else 0

    @property
    def static_axes(self) -> RadarAxes:
        return STATIC_AXES

    def is_populated(self) -> bool:
        return self.model_name in get_lookup_tables()

    def key_count(self, sample_limit: int = 100_000) -> int:
        table = get_lookup_tables().get(self.model_name)
        if table is None:
            return 0
        return min(int(np.sum(~np.isnan(table))), sample_limit)
