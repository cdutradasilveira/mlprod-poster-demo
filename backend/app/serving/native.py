"""Native serving: each model loaded with its training-library API.

Exposes one NativeServer class with three internal sub-paths keyed by `model_name`:
  - logreg, rf  → joblib (sklearn)
  - xgb         → xgboost native JSON (Booster)
  - mlp         → torch state_dict + scaler params

Includes a `predict_proba_batch` helper used by populate_lookup.py and ScriptedServer.
"""
from __future__ import annotations

import time
from pathlib import Path

import joblib
import numpy as np
import torch
import torch.nn as nn
import xgboost as xgb

from app.config import settings
from app.models_io.registry import get_store
from app.serving.base import PredictionResult, RadarAxes, Server

# Static axes for Native, per CLAUDE.md §8.
STATIC_AXES = RadarAxes(
    modeling_flexibility=1.0,
    input_space_flexibility=1.0,
    stack_flexibility=-1.0,
    consistency=1.0,
    observability=0.0,
)
MODELS_DIR = settings.artifacts_dir / "models"


class _MLP(nn.Module):
    def __init__(self, n_features: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_features, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)


class NativeServer(Server):
    method_name = "native"

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._store = get_store()

        if model_name == "logreg":
            bundle = joblib.load(MODELS_DIR / "logreg.pkl")
            self._sk_model = bundle["model"]
            self._sk_scaler = bundle["scaler"]
            self._artifact_path = MODELS_DIR / "logreg.pkl"
            self._kind = "sklearn_scaled"
        elif model_name == "rf":
            bundle = joblib.load(MODELS_DIR / "rf.pkl")
            self._sk_model = bundle["model"]
            self._artifact_path = MODELS_DIR / "rf.pkl"
            self._kind = "sklearn_raw"
        elif model_name == "xgb":
            self._artifact_path = MODELS_DIR / "xgb.json"
            booster = xgb.XGBClassifier()
            booster.load_model(self._artifact_path)
            self._xgb_model = booster
            self._kind = "xgboost"
        elif model_name == "mlp":
            self._artifact_path = MODELS_DIR / "mlp.pt"
            blob = torch.load(self._artifact_path, weights_only=False, map_location="cpu")
            self._mlp_model = _MLP(blob["n_features"])
            self._mlp_model.load_state_dict(blob["state_dict"])
            self._mlp_model.eval()
            self._mlp_mean = np.asarray(blob["scaler_mean"], dtype=np.float32)
            self._mlp_scale = np.asarray(blob["scaler_scale"], dtype=np.float32)
            self._kind = "torch"
        else:
            raise ValueError(f"Unknown model_name={model_name!r}")

    def predict(self, user_id: int, hotel_id: int) -> PredictionResult:
        t0 = time.perf_counter()
        x_raw = self._store.get_features(user_id, hotel_id).astype(np.float32)
        prob = self._predict_one(x_raw)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        return PredictionResult(
            probability=float(prob),
            latency_ms=latency_ms,
            metadata={"runtime": self._kind},
        )

    def _predict_one(self, x_raw: np.ndarray) -> float:
        x = x_raw.reshape(1, -1)
        if self._kind == "sklearn_scaled":
            xs = self._sk_scaler.transform(x)
            return float(self._sk_model.predict_proba(xs)[0, 1])
        if self._kind == "sklearn_raw":
            return float(self._sk_model.predict_proba(x)[0, 1])
        if self._kind == "xgboost":
            return float(self._xgb_model.predict_proba(x)[0, 1])
        if self._kind == "torch":
            xs = (x - self._mlp_mean) / self._mlp_scale
            with torch.no_grad():
                t = torch.from_numpy(xs.astype(np.float32))
                return float(self._mlp_model(t).item())
        raise RuntimeError(f"Unknown kind: {self._kind}")

    def predict_proba_batch(self, X: np.ndarray) -> np.ndarray:
        """Vectorized batch prediction. Used by populate_lookup.py."""
        X = np.asarray(X, dtype=np.float32)
        if self._kind == "sklearn_scaled":
            Xs = self._sk_scaler.transform(X)
            return self._sk_model.predict_proba(Xs)[:, 1]
        if self._kind == "sklearn_raw":
            return self._sk_model.predict_proba(X)[:, 1]
        if self._kind == "xgboost":
            return self._xgb_model.predict_proba(X)[:, 1]
        if self._kind == "torch":
            Xs = (X - self._mlp_mean) / self._mlp_scale
            with torch.no_grad():
                return self._mlp_model(torch.from_numpy(Xs.astype(np.float32))).cpu().numpy().reshape(-1)
        raise RuntimeError(f"Unknown kind: {self._kind}")

    def artifact_size_bytes(self) -> int:
        return self._artifact_path.stat().st_size

    @property
    def static_axes(self) -> RadarAxes:
        return STATIC_AXES

    @property
    def kind(self) -> str:
        return self._kind
