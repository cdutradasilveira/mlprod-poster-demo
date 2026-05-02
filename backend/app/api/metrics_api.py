from __future__ import annotations

from fastapi import APIRouter

from app.metrics.serving import get_metrics

router = APIRouter()


@router.get("/metrics")
def all_metrics() -> dict:
    return {"snapshots": get_metrics().all_snapshots()}


@router.post("/metrics/reset")
def reset_metrics() -> dict:
    get_metrics().reset()
    return {"reset": True}
