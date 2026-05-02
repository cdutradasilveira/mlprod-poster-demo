"""In-memory feature store loaded once at startup.

Reads users.parquet and hotels.parquet (the two catalog tables) into dicts keyed by id,
and exposes get_features(user_id, hotel_id) that builds the canonical feature vector
for any (user, hotel) pair, including the derived `same_region` flag.

Justification for keeping this in memory: paper §3.2 frames it as the role of a feature
store at serving time. With 2,000 users + 500 hotels the dicts are ~50 KB total.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.config import settings
from app.data.synthetic import COUNTRY_HOME_CITIES, FEATURE_ORDER

DATA_DIR = settings.artifacts_dir / "data"


class FeatureStore:
    def __init__(self) -> None:
        users_path = DATA_DIR / "users.parquet"
        hotels_path = DATA_DIR / "hotels.parquet"
        if not users_path.exists() or not hotels_path.exists():
            raise FileNotFoundError(
                f"Missing catalog parquets in {DATA_DIR}. Run scripts/generate_data.py first."
            )
        users_df = pd.read_parquet(users_path)
        hotels_df = pd.read_parquet(hotels_path)
        self._users: dict[int, dict] = {
            int(row["user_id"]): row.to_dict() for _, row in users_df.iterrows()
        }
        self._hotels: dict[int, dict] = {
            int(row["hotel_id"]): row.to_dict() for _, row in hotels_df.iterrows()
        }
        self.user_ids: list[int] = sorted(self._users.keys())
        self.hotel_ids: list[int] = sorted(self._hotels.keys())

    @property
    def n_users(self) -> int:
        return len(self._users)

    @property
    def n_hotels(self) -> int:
        return len(self._hotels)

    def user_exists(self, user_id: int) -> bool:
        return user_id in self._users

    def hotel_exists(self, hotel_id: int) -> bool:
        return hotel_id in self._hotels

    def get_user(self, user_id: int) -> dict:
        if user_id not in self._users:
            raise KeyError(f"Unknown user_id={user_id}")
        return self._users[user_id]

    def get_hotel(self, hotel_id: int) -> dict:
        if hotel_id not in self._hotels:
            raise KeyError(f"Unknown hotel_id={hotel_id}")
        return self._hotels[hotel_id]

    def get_features(self, user_id: int, hotel_id: int) -> np.ndarray:
        user = self.get_user(user_id)
        hotel = self.get_hotel(hotel_id)
        same_region = (
            1 if hotel["city"] in COUNTRY_HOME_CITIES.get(user["country"], ()) else 0
        )
        merged = {**user, **hotel, "same_region": same_region}
        return np.asarray([merged[k] for k in FEATURE_ORDER], dtype=np.float32)


_store: FeatureStore | None = None


def get_store() -> FeatureStore:
    global _store
    if _store is None:
        _store = FeatureStore()
    return _store


def reset_store_for_tests() -> None:
    """Test helper: forces re-load on next get_store() call."""
    global _store
    _store = None
