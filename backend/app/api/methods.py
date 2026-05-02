from __future__ import annotations

from fastapi import APIRouter

from app.api.compatibility import (
    METHOD_DISPLAY,
    METHODS,
    matrix_payload,
    MODELS,
    MODEL_DISPLAY,
)

router = APIRouter()


@router.get("/methods")
def list_methods() -> dict:
    return {
        "methods": [
            {"id": m, **METHOD_DISPLAY[m]} for m in METHODS
        ]
    }


@router.get("/compatibility")
def compatibility() -> dict:
    return {
        "models": MODELS,
        "methods": METHODS,
        "matrix": matrix_payload(),
        "model_display": MODEL_DISPLAY,
        "method_display": METHOD_DISPLAY,
    }
