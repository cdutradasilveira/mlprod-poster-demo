"""Populate Redis with predictions for all 4 models × the (user, hotel) grid.

Per CLAUDE.md §7.1 / Phase 2:
  - Build the cartesian feature matrix for user_id ∈ [0, 999] × hotel_id ∈ [0, 499]
    (= 500_000 rows per model). Users 1000..1999 are intentionally NOT populated so the
    demo can showcase lookup misses.
  - Predict in batch (one call per model) — never one-by-one.
  - Insert with MSET pipelined in chunks.

Expected total time: a few seconds per model (tens of seconds total for all four).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import redis

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402
from app.data.synthetic import COUNTRY_HOME_CITIES, FEATURE_ORDER  # noqa: E402
from app.models_io.registry import get_store  # noqa: E402
from app.serving.lookup import lookup_key  # noqa: E402
from app.serving.native import NativeServer  # noqa: E402

USER_RANGE = (0, 1000)  # exclusive end
HOTEL_RANGE = (0, 500)
WRITE_CHUNK = 10_000
PREDICT_CHUNK = 50_000


def build_grid_features() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (X, user_ids, hotel_ids) for the full cartesian grid."""
    store = get_store()
    user_ids = np.arange(USER_RANGE[0], USER_RANGE[1], dtype=np.int32)
    hotel_ids = np.arange(HOTEL_RANGE[0], HOTEL_RANGE[1], dtype=np.int32)

    n_u = len(user_ids)
    n_h = len(hotel_ids)
    n = n_u * n_h
    X = np.empty((n, len(FEATURE_ORDER)), dtype=np.float32)
    pair_uids = np.empty(n, dtype=np.int32)
    pair_hids = np.empty(n, dtype=np.int32)

    feature_idx = {name: i for i, name in enumerate(FEATURE_ORDER)}
    idx = 0
    for uid in user_ids:
        u = store.get_user(int(uid))
        u_country = u["country"]
        for hid in hotel_ids:
            h = store.get_hotel(int(hid))
            sr = 1 if h["city"] in COUNTRY_HOME_CITIES.get(u_country, ()) else 0
            row = {**u, **h, "same_region": sr}
            for fname, fi in feature_idx.items():
                X[idx, fi] = row[fname]
            pair_uids[idx] = uid
            pair_hids[idx] = hid
            idx += 1
    return X, pair_uids, pair_hids


def main() -> None:
    print(
        f"Building feature grid: users {USER_RANGE[0]}..{USER_RANGE[1] - 1}"
        f" × hotels {HOTEL_RANGE[0]}..{HOTEL_RANGE[1] - 1}"
        f" = {(USER_RANGE[1] - USER_RANGE[0]) * (HOTEL_RANGE[1] - HOTEL_RANGE[0]):,} pairs"
    )
    t0 = time.perf_counter()
    X, uids, hids = build_grid_features()
    print(f"  built in {time.perf_counter() - t0:.2f}s — shape={X.shape}")

    r = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    grand_t0 = time.perf_counter()

    for model_name in ("logreg", "rf", "xgb", "mlp"):
        print(f"\n[{model_name}] loading native server...")
        load_t0 = time.perf_counter()
        server = NativeServer(model_name)
        load_dt = time.perf_counter() - load_t0

        # Predict in chunks to bound peak memory (matters for MLP on large batches).
        pred_t0 = time.perf_counter()
        probs = np.empty(len(X), dtype=np.float64)
        for start in range(0, len(X), PREDICT_CHUNK):
            end = min(start + PREDICT_CHUNK, len(X))
            probs[start:end] = server.predict_proba_batch(X[start:end])
        pred_dt = time.perf_counter() - pred_t0

        # Pipelined MSET in WRITE_CHUNK groups.
        write_t0 = time.perf_counter()
        for start in range(0, len(probs), WRITE_CHUNK):
            end = min(start + WRITE_CHUNK, len(probs))
            mapping = {
                lookup_key(model_name, int(uids[i]), int(hids[i])): f"{probs[i]:.6f}"
                for i in range(start, end)
            }
            r.mset(mapping)
        write_dt = time.perf_counter() - write_t0

        print(
            f"  load={load_dt:.2f}s  predict={pred_dt:.2f}s ({len(probs):,} rows)"
            f"  write={write_dt:.2f}s"
        )

    total_dt = time.perf_counter() - grand_t0
    total_keys = r.dbsize()
    print(f"\nDone in {total_dt:.2f}s. Total keys in Redis: {total_keys:,}")


if __name__ == "__main__":
    main()
