"""Generate the synthetic dataset and persist parquet artifacts.

Outputs (under backend/artifacts/data/):
    - users.parquet, hotels.parquet         catalog tables
    - users_hotels.parquet                  combined catalog (users + hotels stacked, role column)
    - bookings.parquet                      raw label table
    - train.parquet, val.parquet, test.parquet
                                            stratified 70/15/15 split with features + label

The split parquets already include feature columns + `booked` so train_all.py and
populate_lookup.py can consume them directly without re-joining.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402
from app.data.synthetic import (  # noqa: E402
    FEATURE_ORDER,
    generate,
    join_with_features,
)

OUT_DIR = settings.artifacts_dir / "data"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Generating synthetic dataset (seed=42)...")
    ds = generate(seed=42)
    print(f"  users:    {len(ds.users):,}")
    print(f"  hotels:   {len(ds.hotels):,}")
    print(f"  bookings: {len(ds.bookings):,} (positive rate {ds.bookings.booked.mean():.3f})")

    print("Joining bookings with user + hotel features...")
    enriched = join_with_features(ds.bookings, ds.users, ds.hotels)

    # Stratified 70/15/15 split.
    train_df, temp_df = train_test_split(
        enriched, test_size=0.30, stratify=enriched["booked"], random_state=42
    )
    val_df, test_df = train_test_split(
        temp_df, test_size=0.50, stratify=temp_df["booked"], random_state=42
    )

    print(
        f"  split sizes: train={len(train_df):,}  val={len(val_df):,}  test={len(test_df):,}"
    )

    # Persist.
    ds.users.to_parquet(OUT_DIR / "users.parquet", index=False)
    ds.hotels.to_parquet(OUT_DIR / "hotels.parquet", index=False)

    # Combined catalog: stack users+hotels with a `role` column to satisfy the spec's single
    # users_hotels.parquet artifact while still being trivially separable.
    users_with_role = ds.users.assign(role="user")
    hotels_with_role = ds.hotels.assign(role="hotel")
    combined = pd.concat([users_with_role, hotels_with_role], ignore_index=True)
    combined.to_parquet(OUT_DIR / "users_hotels.parquet", index=False)

    ds.bookings.to_parquet(OUT_DIR / "bookings.parquet", index=False)
    train_df.to_parquet(OUT_DIR / "train.parquet", index=False)
    val_df.to_parquet(OUT_DIR / "val.parquet", index=False)
    test_df.to_parquet(OUT_DIR / "test.parquet", index=False)

    print(f"\nWrote artifacts to {OUT_DIR}")
    print(f"Feature order ({len(FEATURE_ORDER)}): {FEATURE_ORDER}")


if __name__ == "__main__":
    main()
