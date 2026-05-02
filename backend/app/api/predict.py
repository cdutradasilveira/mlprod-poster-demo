from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.compatibility import is_compatible
from app.metrics.serving import get_metrics
from app.models_io.registry import get_store
from app.serving.factory import get_factory

logger = logging.getLogger("ml-prod-demo.predict")
router = APIRouter()


class PredictRequest(BaseModel):
    model: str = Field(..., description="Model id: logreg | rf | xgb | mlp")
    method: str = Field(..., description="Method id: lookup | glm | native | scripted")
    user_id: int = Field(..., ge=0)
    hotel_id: int = Field(..., ge=0)


class PredictResponse(BaseModel):
    model: str
    method: str
    user_id: int
    hotel_id: int
    probability: float | None
    latency_ms: float
    method_metadata: dict[str, Any]
    outcome: str  # "hit" | "miss" | "error"


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    compatible, reason = is_compatible(req.model, req.method)
    if not compatible:
        logger.info(
            "predict model=%s method=%s user=%d hotel=%d latency=0.000ms outcome=rejected reason=incompatible_combination detail=%r",
            req.model, req.method, req.user_id, req.hotel_id, reason,
        )
        raise HTTPException(
            status_code=400,
            detail={
                "error": "incompatible_combination",
                "model": req.model,
                "method": req.method,
                "reason": reason,
            },
        )

    store = get_store()
    if not store.user_exists(req.user_id):
        raise HTTPException(
            status_code=404, detail=f"Unknown user_id={req.user_id}"
        )
    if not store.hotel_exists(req.hotel_id):
        raise HTTPException(
            status_code=404, detail=f"Unknown hotel_id={req.hotel_id}"
        )

    server = get_factory().get(req.model, req.method)
    try:
        result = server.predict(req.user_id, req.hotel_id)
    except Exception as exc:  # surface errors to the metrics + caller
        get_metrics().record(req.model, req.method, 0.0, outcome="error")
        logger.exception(
            "predict_error model=%s method=%s user=%d hotel=%d",
            req.model, req.method, req.user_id, req.hotel_id,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if req.method == "lookup":
        outcome = "hit" if result.metadata.get("cache_hit") else "miss"
    else:
        outcome = "hit"

    # The Scripted method always wraps the PyTorch MLP regardless of the model the
    # caller selected (CLAUDE.md §7.4). Annotate the response so API consumers don't
    # think the `model` parameter actually drove this prediction.
    metadata = dict(result.metadata)
    if req.method == "scripted" and req.model != "mlp":
        metadata["note"] = (
            "The 'model' parameter was ignored. Scripted always uses the "
            "PyTorch MLP per paper §3.4."
        )
        metadata["effective_model"] = "mlp"

    get_metrics().record(req.model, req.method, result.latency_ms, outcome=outcome)

    prob_str = f"{result.probability:.4f}" if result.probability is not None else "miss"
    logger.info(
        "predict model=%s method=%s user=%d hotel=%d latency=%.3fms outcome=%s prob=%s",
        req.model, req.method, req.user_id, req.hotel_id,
        result.latency_ms, outcome, prob_str,
    )

    return PredictResponse(
        model=req.model,
        method=req.method,
        user_id=req.user_id,
        hotel_id=req.hotel_id,
        probability=result.probability,
        latency_ms=result.latency_ms,
        method_metadata=metadata,
        outcome=outcome,
    )
