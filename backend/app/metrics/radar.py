"""6-axis radar scoring for (model × method) combinations.

Five axes are static per method (paper §4 + CLAUDE.md §8 extension); the sixth
(latency) is dynamic, mapped from observed p95.
"""
from __future__ import annotations

from app.serving.base import RadarAxes
from app.serving.glm import STATIC_AXES as GLM_AXES
from app.serving.lookup import STATIC_AXES as LOOKUP_AXES
from app.serving.native import STATIC_AXES as NATIVE_AXES
from app.serving.scripted import STATIC_AXES as SCRIPTED_AXES

STATIC_AXES_BY_METHOD: dict[str, RadarAxes] = {
    "lookup": LOOKUP_AXES,
    "glm": GLM_AXES,
    "native": NATIVE_AXES,
    "scripted": SCRIPTED_AXES,
}


def latency_axis(p95_ms: float | None) -> float | None:
    """Map observed p95 latency to a [-1, +1] band, per CLAUDE.md §8.

    ≤ 2 ms   →  +1
    2–10 ms  →   0
    > 10 ms  →  -1
    None (no data yet) → None (UI greys out the axis)
    """
    if p95_ms is None:
        return None
    if p95_ms <= 2.0:
        return 1.0
    if p95_ms <= 10.0:
        return 0.0
    return -1.0


def full_radar(method: str, p95_ms: float | None) -> dict:
    """All 6 axes as a flat dict for one method, with latency populated if available."""
    static = STATIC_AXES_BY_METHOD[method]
    return {
        **static.as_dict(),
        "latency": latency_axis(p95_ms),
    }
