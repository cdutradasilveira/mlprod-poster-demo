"""GLM serving: numpy-only inner product + sigmoid, no sklearn at runtime.

This is the point of the GLM method per the paper §3.2: the serving runtime is
library-independent. The model is just a JSON of weights + scaler params.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from app.config import settings
from app.models_io.registry import get_store
from app.serving.base import PredictionResult, RadarAxes, Server

# Static axes for GLM, per CLAUDE.md §8.
STATIC_AXES = RadarAxes(
    modeling_flexibility=-1.0,
    input_space_flexibility=1.0,
    stack_flexibility=1.0,
    consistency=-1.0,
    observability=1.0,
)


class GLMServer(Server):
    method_name = "glm"
    # Only LogReg supports GLM serving in this demo. The compatibility matrix enforces it.
    model_name = "logreg"

    def __init__(self, weights_path: Path | None = None) -> None:
        self._path = weights_path or (settings.artifacts_dir / "models" / "glm_weights.json")
        with self._path.open() as fh:
            payload = json.load(fh)
        self._feature_order = payload["feature_order"]
        self._mean = np.asarray(payload["scaler_mean"], dtype=np.float64)
        self._scale = np.asarray(payload["scaler_scale"], dtype=np.float64)
        self._weights = np.asarray(payload["weights"], dtype=np.float64)
        self._intercept = float(payload["intercept"])
        self._link = payload["link"]
        if self._link != "sigmoid":
            raise ValueError(f"GLM only supports link='sigmoid'; got {self._link!r}")
        self._store = get_store()

    def _scale_features(self, x: np.ndarray) -> np.ndarray:
        return (x - self._mean) / self._scale

    def predict(self, user_id: int, hotel_id: int) -> PredictionResult:
        t0 = time.perf_counter()
        x_raw = self._store.get_features(user_id, hotel_id).astype(np.float64)
        x_scaled = self._scale_features(x_raw)
        z = float(np.dot(self._weights, x_scaled) + self._intercept)
        prob = 1.0 / (1.0 + np.exp(-z))
        latency_ms = (time.perf_counter() - t0) * 1000.0
        return PredictionResult(
            probability=float(prob),
            latency_ms=latency_ms,
            metadata={"link": self._link, "n_features": len(self._weights)},
        )

    def artifact_size_bytes(self) -> int:
        return self._path.stat().st_size

    @property
    def static_axes(self) -> RadarAxes:
        return STATIC_AXES
