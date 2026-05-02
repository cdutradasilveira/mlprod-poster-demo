from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api.compatibility import MODELS, MODEL_DISPLAY
from app.config import settings
from app.serving.factory import get_factory

router = APIRouter()

METRICS_PATH = settings.artifacts_dir / "metrics" / "model_quality.json"


def _load_quality() -> dict:
    if not METRICS_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                f"model_quality.json not found at {METRICS_PATH}. "
                "Run scripts/train_all.py first."
            ),
        )
    with METRICS_PATH.open() as fh:
        return json.load(fh)


@router.get("/models")
def list_models() -> dict:
    quality = _load_quality()
    factory = get_factory()
    out = []
    for model_id in MODELS:
        info = quality["models"].get(model_id, {})
        loaded = ("native", "lookup") in factory.loaded_combinations() or any(
            (model_id, m) in factory.loaded_combinations() for m in ("native", "lookup")
        )
        out.append(
            {
                "id": model_id,
                **MODEL_DISPLAY[model_id],
                "loaded": loaded,
                "training_time_s": info.get("training_time_s"),
                "artifact_size_bytes": info.get("artifact_size_bytes"),
                "auc_test": info.get("auc_roc"),
                "auc_train": info.get("auc_roc_train"),
            }
        )
    return {"models": out}


@router.get("/models/metrics")
def model_metrics() -> dict:
    return _load_quality()
