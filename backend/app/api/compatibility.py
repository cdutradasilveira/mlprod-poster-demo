"""Model × Method compatibility matrix and helpers.

Single source of truth for the matrix in CLAUDE.md §2. Reasons for invalid cells are
paper-anchored so the UI can surface them (Tab 1 callout, Tab 4 grid).
"""
from __future__ import annotations

from typing import Iterable

MODELS: list[str] = ["logreg", "rf", "xgb", "mlp"]
METHODS: list[str] = ["lookup", "glm", "native", "scripted"]

MODEL_DISPLAY: dict[str, dict[str, str]] = {
    "logreg": {"display_name": "Logistic Regression", "library": "scikit-learn"},
    "rf": {"display_name": "Random Forest", "library": "scikit-learn"},
    "xgb": {"display_name": "Gradient Boosting", "library": "XGBoost"},
    "mlp": {"display_name": "MLP", "library": "PyTorch"},
}

METHOD_DISPLAY: dict[str, dict[str, str]] = {
    "lookup": {
        "display_name": "Lookup Table",
        "description": (
            "Precomputed predictions stored in an in-process numpy array. "
            "Lowest possible latency — pure Python dict lookup, no network hop. "
            "Limited to enumerable input spaces (paper §3.1)."
        ),
    },
    "glm": {
        "display_name": "GLM",
        "description": (
            "Linear weights extracted to JSON; serving is a numpy inner product + "
            "sigmoid. No ML library at runtime (paper §3.2)."
        ),
    },
    "native": {
        "display_name": "Native Library",
        "description": (
            "Model loaded via its training library's API (sklearn / XGBoost / PyTorch). "
            "Maximum consistency, requires the training stack at serving time (paper §3.3)."
        ),
    },
    "scripted": {
        "display_name": "Scripted Model",
        "description": (
            "Python script wrapping a model + business rules (cold-start, diversity, "
            "clipping). Maximum flexibility, every line is a potential cost line (paper §3.4)."
        ),
    },
}

_GLM_REASON = (
    "GLM only supports models linear in their parameters — see paper, Section 3.2. "
    "{model_name} is non-linear, so its predictions cannot be expressed as σ(W·x + b)."
)

_INVALID_REASONS: dict[tuple[str, str], str] = {
    ("rf", "glm"): _GLM_REASON.format(model_name="Random Forest"),
    ("xgb", "glm"): _GLM_REASON.format(model_name="Gradient Boosting (XGBoost)"),
    ("mlp", "glm"): _GLM_REASON.format(model_name="MLP"),
}


def is_compatible(model: str, method: str) -> tuple[bool, str | None]:
    """Return (compatible, reason). If compatible, reason is None."""
    if model not in MODEL_DISPLAY:
        return False, f"Unknown model: {model!r}"
    if method not in METHOD_DISPLAY:
        return False, f"Unknown method: {method!r}"
    reason = _INVALID_REASONS.get((model, method))
    return reason is None, reason


def all_combinations() -> Iterable[tuple[str, str]]:
    for m in MODELS:
        for me in METHODS:
            yield m, me


def valid_combinations() -> Iterable[tuple[str, str]]:
    for m, me in all_combinations():
        ok, _ = is_compatible(m, me)
        if ok:
            yield m, me


def matrix_payload() -> list[list[dict]]:
    """4×4 grid for GET /api/compatibility — rows = models, cols = methods."""
    out: list[list[dict]] = []
    for model in MODELS:
        row: list[dict] = []
        for method in METHODS:
            ok, reason = is_compatible(model, method)
            row.append({"compatible": ok, "reason": reason})
        out.append(row)
    return out
