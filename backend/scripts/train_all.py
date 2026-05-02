"""Train the four models, evaluate on the test set, and persist artifacts + metrics.

Outputs (under backend/artifacts/):
    models/
        logreg.pkl              joblib (LogReg + StandardScaler bundle)
        glm_weights.json        feature_order, scaler params, weights, intercept, link
        rf.pkl                  joblib
        xgb.json                XGBoost native serialization
        mlp.pt                  torch state_dict + scaler + feature_order
    metrics/
        model_quality.json      AUC, log-loss, accuracy/p/r/F1, CM, ROC, PR, prob histograms,
                                feature importances, training time per model
        artifact_sizes.json     bytes per artifact
"""
from __future__ import annotations

import json
import random
import sys
import time
import warnings
from dataclasses import dataclass
from pathlib import Path

# NOTE: xgboost must be imported before scikit-learn on macOS ARM to avoid an OpenMP
# init conflict that crashes the process (SIGSEGV).
import xgboost as xgb  # noqa: I001  (import order matters)

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# ----- determinism + clean logs -----
warnings.filterwarnings("ignore", category=UserWarning, module="torch")
np.random.seed(42)
random.seed(42)
torch.manual_seed(42)
torch.use_deterministic_algorithms(True, warn_only=True)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402
from app.data.synthetic import FEATURE_ORDER, build_feature_matrix  # noqa: E402

DATA_DIR = settings.artifacts_dir / "data"
MODELS_DIR = settings.artifacts_dir / "models"
METRICS_DIR = settings.artifacts_dir / "metrics"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
METRICS_DIR.mkdir(parents=True, exist_ok=True)

DEVICE = torch.device("cpu")
ROC_POINTS = 100
PR_POINTS = 100
HIST_BINS = 30
PERM_SAMPLE = 2000
PERM_REPEATS = 5


# -------------------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------------------


def downsample_curve(x: np.ndarray, y: np.ndarray, n_points: int) -> tuple[list[float], list[float]]:
    if len(x) <= n_points:
        return x.tolist(), y.tolist()
    idx = np.linspace(0, len(x) - 1, n_points).astype(int)
    return x[idx].tolist(), y[idx].tolist()


def prob_histograms(probs: np.ndarray, y_true: np.ndarray) -> dict:
    edges = np.linspace(0.0, 1.0, HIST_BINS + 1)
    pos_counts, _ = np.histogram(probs[y_true == 1], bins=edges)
    neg_counts, _ = np.histogram(probs[y_true == 0], bins=edges)
    return {
        "bin_edges": edges.tolist(),
        "positive": pos_counts.astype(int).tolist(),
        "negative": neg_counts.astype(int).tolist(),
    }


def evaluation_block(probs: np.ndarray, y_true: np.ndarray) -> dict:
    preds = (probs >= 0.5).astype(int)
    fpr, tpr, _ = roc_curve(y_true, probs)
    precisions, recalls, _ = precision_recall_curve(y_true, probs)
    cm = confusion_matrix(y_true, preds, labels=[0, 1]).astype(int).tolist()
    fpr_ds, tpr_ds = downsample_curve(fpr, tpr, ROC_POINTS)
    rec_ds, prec_ds = downsample_curve(recalls, precisions, PR_POINTS)
    return {
        "auc_roc": float(roc_auc_score(y_true, probs)),
        "log_loss": float(log_loss(y_true, np.clip(probs, 1e-7, 1 - 1e-7))),
        "accuracy": float(accuracy_score(y_true, preds)),
        "precision": float(precision_score(y_true, preds, zero_division=0)),
        "recall": float(recall_score(y_true, preds, zero_division=0)),
        "f1": float(f1_score(y_true, preds, zero_division=0)),
        "confusion_matrix": cm,
        "roc_curve": {"fpr": fpr_ds, "tpr": tpr_ds},
        "pr_curve": {"recall": rec_ds, "precision": prec_ds},
        "predicted_probability_histogram": prob_histograms(probs, y_true),
    }


@dataclass
class ModelResult:
    name: str
    library: str
    artifact_path: Path
    training_time_s: float
    metrics: dict


def load_split(name: str) -> tuple[np.ndarray, np.ndarray]:
    df = pd.read_parquet(DATA_DIR / f"{name}.parquet")
    X = build_feature_matrix(df).to_numpy(dtype=np.float32)
    y = df["booked"].to_numpy(dtype=np.int8)
    return X, y


# -------------------------------------------------------------------------------------
# MLP definition + wrapper for permutation_importance
# -------------------------------------------------------------------------------------


class MLP(nn.Module):
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


class TorchClassifierAdapter(ClassifierMixin, BaseEstimator):
    """Sklearn-compatible wrapper around a trained torch model + its scaler."""

    classes_ = np.array([0, 1])
    _estimator_type = "classifier"

    def __init__(self, model: nn.Module, scaler: StandardScaler) -> None:
        self.model = model
        self.scaler = scaler

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        X = np.asarray(X, dtype=np.float32)
        Xs = self.scaler.transform(X).astype(np.float32)
        with torch.no_grad():
            t = torch.from_numpy(Xs)
            p = self.model(t).cpu().numpy().reshape(-1)
        p = np.clip(p, 0.0, 1.0)
        return np.column_stack([1.0 - p, p])

    def predict(self, X: np.ndarray) -> np.ndarray:
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)

    def fit(self, X: np.ndarray, y: np.ndarray) -> "TorchClassifierAdapter":
        return self


# -------------------------------------------------------------------------------------
# Training
# -------------------------------------------------------------------------------------


def train_logreg(X_train: np.ndarray, y_train: np.ndarray) -> tuple[dict, float, Path]:
    t0 = time.perf_counter()
    scaler = StandardScaler().fit(X_train)
    Xs = scaler.transform(X_train)
    model = LogisticRegression(max_iter=500, random_state=42)
    model.fit(Xs, y_train)
    train_time = time.perf_counter() - t0

    artifact_path = MODELS_DIR / "logreg.pkl"
    joblib.dump({"model": model, "scaler": scaler, "feature_order": FEATURE_ORDER}, artifact_path)

    glm_payload = {
        "feature_order": FEATURE_ORDER,
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "weights": model.coef_[0].tolist(),
        "intercept": float(model.intercept_[0]),
        "link": "sigmoid",
    }
    (MODELS_DIR / "glm_weights.json").write_text(json.dumps(glm_payload, indent=2))

    return {"model": model, "scaler": scaler}, train_time, artifact_path


def train_random_forest(X_train: np.ndarray, y_train: np.ndarray) -> tuple[dict, float, Path]:
    t0 = time.perf_counter()
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    train_time = time.perf_counter() - t0

    artifact_path = MODELS_DIR / "rf.pkl"
    joblib.dump({"model": model, "feature_order": FEATURE_ORDER}, artifact_path)
    return {"model": model}, train_time, artifact_path


def train_xgboost(X_train: np.ndarray, y_train: np.ndarray) -> tuple[dict, float, Path]:
    t0 = time.perf_counter()
    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        random_state=42,
        n_jobs=1,  # n_jobs>1 SIGSEGVs on macOS ARM with libomp present
        eval_metric="logloss",
    )
    model.fit(X_train, y_train)
    train_time = time.perf_counter() - t0

    artifact_path = MODELS_DIR / "xgb.json"
    model.save_model(artifact_path)
    return {"model": model}, train_time, artifact_path


def train_mlp(
    X_train: np.ndarray, y_train: np.ndarray, X_val: np.ndarray, y_val: np.ndarray
) -> tuple[dict, float, Path]:
    t0 = time.perf_counter()
    scaler = StandardScaler().fit(X_train)
    Xs_train = torch.from_numpy(scaler.transform(X_train).astype(np.float32))
    Xs_val = torch.from_numpy(scaler.transform(X_val).astype(np.float32))
    y_train_t = torch.from_numpy(y_train.astype(np.float32))
    y_val_t = torch.from_numpy(y_val.astype(np.float32))

    model = MLP(n_features=Xs_train.shape[1]).to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=4
    )
    loss_fn = nn.BCELoss()

    batch_size = 128
    n_epochs = 100
    min_epochs = 15
    patience = 10
    best_val_loss = float("inf")
    bad_epochs = 0
    best_state = None
    history: list[tuple[int, float, float]] = []

    n = Xs_train.shape[0]
    indices = np.arange(n)
    for epoch in range(n_epochs):
        np.random.shuffle(indices)
        model.train()
        epoch_loss_sum = 0.0
        epoch_count = 0
        for start in range(0, n, batch_size):
            idx = indices[start : start + batch_size]
            xb = Xs_train[idx]
            yb = y_train_t[idx]
            optimizer.zero_grad()
            preds = model(xb)
            loss = loss_fn(preds, yb)
            loss.backward()
            optimizer.step()
            epoch_loss_sum += loss.item() * len(idx)
            epoch_count += len(idx)

        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(Xs_val), y_val_t).item()
        train_loss = epoch_loss_sum / max(epoch_count, 1)
        history.append((epoch, train_loss, val_loss))
        scheduler.step(val_loss)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            bad_epochs = 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            bad_epochs += 1
            if epoch + 1 >= min_epochs and bad_epochs >= patience:
                break

    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()
    train_time = time.perf_counter() - t0
    final_epoch = history[-1][0] + 1 if history else 0
    print(
        f"  MLP epochs run={final_epoch}  best_val_loss={best_val_loss:.4f}  "
        f"final_lr={optimizer.param_groups[0]['lr']:.2e}",
        flush=True,
    )

    artifact_path = MODELS_DIR / "mlp.pt"
    torch.save(
        {
            "state_dict": model.state_dict(),
            "scaler_mean": scaler.mean_.tolist(),
            "scaler_scale": scaler.scale_.tolist(),
            "feature_order": FEATURE_ORDER,
            "n_features": Xs_train.shape[1],
        },
        artifact_path,
    )
    return {"model": model, "scaler": scaler}, train_time, artifact_path


# -------------------------------------------------------------------------------------
# Evaluation
# -------------------------------------------------------------------------------------


def proba_logreg(bundle: dict, X: np.ndarray) -> np.ndarray:
    Xs = bundle["scaler"].transform(X)
    return bundle["model"].predict_proba(Xs)[:, 1]


def proba_tree(bundle: dict, X: np.ndarray) -> np.ndarray:
    return bundle["model"].predict_proba(X)[:, 1]


def proba_xgb(bundle: dict, X: np.ndarray) -> np.ndarray:
    return bundle["model"].predict_proba(X)[:, 1]


def proba_mlp(bundle: dict, X: np.ndarray) -> np.ndarray:
    Xs = bundle["scaler"].transform(X).astype(np.float32)
    with torch.no_grad():
        return bundle["model"](torch.from_numpy(Xs)).cpu().numpy().reshape(-1)


def feature_importance_logreg(bundle: dict) -> list[float]:
    return np.abs(bundle["model"].coef_[0]).tolist()


def feature_importance_tree(bundle: dict) -> list[float]:
    return bundle["model"].feature_importances_.astype(float).tolist()


def feature_importance_mlp(
    bundle: dict, X_test: np.ndarray, y_test: np.ndarray
) -> list[float]:
    X_sample, _, y_sample, _ = train_test_split(
        X_test, y_test, train_size=PERM_SAMPLE, stratify=y_test, random_state=42
    )
    adapter = TorchClassifierAdapter(bundle["model"], bundle["scaler"])
    res = permutation_importance(
        adapter,
        X_sample,
        y_sample,
        n_repeats=PERM_REPEATS,
        random_state=42,
        scoring="roc_auc",
        n_jobs=1,
    )
    return res.importances_mean.astype(float).tolist()


# -------------------------------------------------------------------------------------
# Main
# -------------------------------------------------------------------------------------


def main() -> None:
    print("Loading splits...")
    X_train, y_train = load_split("train")
    X_val, y_val = load_split("val")
    X_test, y_test = load_split("test")
    print(f"  train={X_train.shape}  val={X_val.shape}  test={X_test.shape}")
    print(f"  positive rate (train): {y_train.mean():.3f}")

    results: dict[str, ModelResult] = {}

    print("\n[1/4] Training Logistic Regression (sklearn)...")
    bundle, dt, art = train_logreg(X_train, y_train)
    probs = proba_logreg(bundle, X_test)
    train_auc = roc_auc_score(y_train, proba_logreg(bundle, X_train))
    metrics = evaluation_block(probs, y_test) | {
        "feature_importance": feature_importance_logreg(bundle),
        "auc_roc_train": float(train_auc),
    }
    results["logreg"] = ModelResult("Logistic Regression", "scikit-learn", art, dt, metrics)
    print(f"  done in {dt:.2f}s, train_AUC={train_auc:.4f} test_AUC={metrics['auc_roc']:.4f} gap={train_auc - metrics['auc_roc']:+.4f}")

    print("\n[2/4] Training Random Forest (sklearn)...")
    bundle, dt, art = train_random_forest(X_train, y_train)
    probs = proba_tree(bundle, X_test)
    train_auc = roc_auc_score(y_train, proba_tree(bundle, X_train))
    metrics = evaluation_block(probs, y_test) | {
        "feature_importance": feature_importance_tree(bundle),
        "auc_roc_train": float(train_auc),
    }
    results["rf"] = ModelResult("Random Forest", "scikit-learn", art, dt, metrics)
    print(f"  done in {dt:.2f}s, train_AUC={train_auc:.4f} test_AUC={metrics['auc_roc']:.4f} gap={train_auc - metrics['auc_roc']:+.4f}")

    print("\n[3/4] Training Gradient Boosting (XGBoost)...")
    bundle, dt, art = train_xgboost(X_train, y_train)
    probs = proba_xgb(bundle, X_test)
    train_auc = roc_auc_score(y_train, proba_xgb(bundle, X_train))
    metrics = evaluation_block(probs, y_test) | {
        "feature_importance": feature_importance_tree(bundle),
        "auc_roc_train": float(train_auc),
    }
    results["xgb"] = ModelResult("Gradient Boosting", "XGBoost", art, dt, metrics)
    print(f"  done in {dt:.2f}s, train_AUC={train_auc:.4f} test_AUC={metrics['auc_roc']:.4f} gap={train_auc - metrics['auc_roc']:+.4f}")

    print("\n[4/4] Training MLP (PyTorch)...")
    bundle, dt, art = train_mlp(X_train, y_train, X_val, y_val)
    probs_train = proba_mlp(bundle, X_train)
    probs = proba_mlp(bundle, X_test)
    train_auc = roc_auc_score(y_train, probs_train)
    test_auc = roc_auc_score(y_test, probs)
    print(f"  MLP AUC train={train_auc:.4f}  test={test_auc:.4f}  gap={train_auc - test_auc:+.4f}")
    metrics = evaluation_block(probs, y_test) | {
        "feature_importance": feature_importance_mlp(bundle, X_test, y_test),
        "auc_roc_train": float(train_auc),
    }
    results["mlp"] = ModelResult("MLP", "PyTorch", art, dt, metrics)
    print(f"  done in {dt:.2f}s, AUC={metrics['auc_roc']:.4f}")

    # ---- Persist combined metrics ----
    quality = {
        "feature_order": FEATURE_ORDER,
        "models": {
            key: {
                "display_name": r.name,
                "library": r.library,
                "artifact_path": str(r.artifact_path.relative_to(settings.artifacts_dir.parent)),
                "training_time_s": r.training_time_s,
                "artifact_size_bytes": r.artifact_path.stat().st_size,
                **r.metrics,
            }
            for key, r in results.items()
        },
    }
    (METRICS_DIR / "model_quality.json").write_text(json.dumps(quality, indent=2))

    sizes = {key: r.artifact_path.stat().st_size for key, r in results.items()}
    sizes["glm_weights.json"] = (MODELS_DIR / "glm_weights.json").stat().st_size
    (METRICS_DIR / "artifact_sizes.json").write_text(json.dumps(sizes, indent=2))

    aucs = {k: r.metrics["auc_roc"] for k, r in results.items()}
    print("\n=== AUC summary ===")
    for k, v in sorted(aucs.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<8} AUC={v:.4f}  train={results[k].training_time_s:.2f}s  size={results[k].artifact_path.stat().st_size:,} B")
    spread = max(aucs.values()) - min(aucs.values())
    print(f"  spread = {spread:.4f}  (target: 0.05–0.15)")


if __name__ == "__main__":
    main()
