"""Run a stress test for every valid (model, method) combination.

AUC is **read** from the precomputed model_quality.json — never recomputed in vivo per
combo, both for consistency with Tab 2 and for speed.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.compatibility import valid_combinations
from app.api.stress import _percentiles, _run_stress, MAX_REQUESTS
from app.config import settings

logger = logging.getLogger("ml-prod-demo.compare")
router = APIRouter()

METRICS_PATH = settings.artifacts_dir / "metrics" / "model_quality.json"


class CompareRequest(BaseModel):
    n_requests_per_combo: int = Field(default=500, ge=1, le=MAX_REQUESTS)
    sample_strategy: str = Field(default="uniform")


class CompareRow(BaseModel):
    model: str
    method: str
    p50: float
    p95: float
    p99: float
    auc: float | None
    errors: int
    misses: int
    hits: int


class CompareResponse(BaseModel):
    n_requests_per_combo: int
    sample_strategy: str
    rows: list[CompareRow]
    wall_time_s: float


def _load_aucs() -> dict[str, float]:
    if not METRICS_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=f"model_quality.json not found at {METRICS_PATH}",
        )
    with METRICS_PATH.open() as fh:
        q = json.load(fh)
    return {model: float(m["auc_roc"]) for model, m in q["models"].items()}


@router.post("/compare", response_model=CompareResponse)
def compare(req: CompareRequest) -> CompareResponse:
    aucs = _load_aucs()
    rows: list[CompareRow] = []
    t0 = time.perf_counter()
    # Scripted always wraps the MLP (CLAUDE.md §7.4), so all four (model, scripted)
    # cells would produce the same latency distribution and the same AUC. Emit only
    # one Scripted row, attributed to MLP.
    seen_scripted = False
    for model, method in valid_combinations():
        if method == "scripted":
            if seen_scripted:
                continue
            seen_scripted = True
            model = "mlp"
        latencies, hits, misses, errors = _run_stress(
            model, method, req.n_requests_per_combo, req.sample_strategy  # type: ignore[arg-type]
        )
        p50, p95, p99 = _percentiles(latencies)
        rows.append(
            CompareRow(
                model=model, method=method,
                p50=p50, p95=p95, p99=p99,
                auc=aucs.get(model),
                errors=errors, misses=misses, hits=hits,
            )
        )
    wall = time.perf_counter() - t0
    logger.info(
        "compare n_per_combo=%d strategy=%s combinations=%d wall=%.2fs",
        req.n_requests_per_combo, req.sample_strategy, len(rows), wall,
    )
    return CompareResponse(
        n_requests_per_combo=req.n_requests_per_combo,
        sample_strategy=req.sample_strategy,
        rows=rows,
        wall_time_s=wall,
    )
