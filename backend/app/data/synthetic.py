from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

USER_COUNTRIES = ["US", "UK", "DE", "FR", "ES", "IT", "BR", "JP", "AU", "CA"]
HOTEL_CITIES = ["NYC", "LDN", "BER", "PAR", "MAD", "ROM", "RIO", "TKY", "SYD", "TOR"]

COUNTRY_HOME_CITIES: dict[str, set[str]] = {
    "US": {"NYC", "TOR"},
    "CA": {"NYC", "TOR"},
    "UK": {"LDN"},
    "DE": {"BER"},
    "FR": {"PAR"},
    "ES": {"MAD"},
    "IT": {"ROM"},
    "BR": {"RIO"},
    "JP": {"TKY"},
    "AU": {"SYD"},
}

CONTINUOUS_FEATURES = [
    "age",
    "preference_luxury",
    "preference_proximity",
    "historical_bookings_count",
    "rating",
    "price_per_night",
    "distance_to_center_km",
]
BINARY_FEATURES = [
    "is_business_traveler",
    "has_pool",
    "has_spa",
    "is_business_friendly",
    "is_family_friendly",
    "same_region",
]
FEATURE_ORDER: list[str] = CONTINUOUS_FEATURES + BINARY_FEATURES


@dataclass(frozen=True)
class SyntheticDataset:
    users: pd.DataFrame
    hotels: pd.DataFrame
    bookings: pd.DataFrame  # user_id, hotel_id, booked


def _generate_users(rng: np.random.Generator, n: int = 2000) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "user_id": np.arange(n, dtype=np.int32),
            "age": rng.integers(18, 76, n).astype(np.int16),
            "preference_luxury": rng.beta(2.0, 5.0, n).astype(np.float32),
            "preference_proximity": rng.beta(3.0, 3.0, n).astype(np.float32),
            "historical_bookings_count": rng.poisson(5.0, n).clip(0, 50).astype(np.int16),
            "is_business_traveler": rng.binomial(1, 0.3, n).astype(np.int8),
            "country": rng.choice(USER_COUNTRIES, n),
        }
    )


def _generate_hotels(rng: np.random.Generator, n: int = 500) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "hotel_id": np.arange(n, dtype=np.int32),
            "rating": np.round(1.0 + rng.beta(5.0, 2.0, n) * 4.0, 1).astype(np.float32),
            "price_per_night": np.round(
                np.clip(40.0 + rng.gamma(3.0, 50.0, n), 40.0, 500.0), 2
            ).astype(np.float32),
            "distance_to_center_km": np.round(
                np.clip(rng.gamma(2.0, 4.0, n), 0.0, 25.0), 1
            ).astype(np.float32),
            "has_pool": rng.binomial(1, 0.4, n).astype(np.int8),
            "has_spa": rng.binomial(1, 0.25, n).astype(np.int8),
            "is_business_friendly": rng.binomial(1, 0.5, n).astype(np.int8),
            "is_family_friendly": rng.binomial(1, 0.4, n).astype(np.int8),
            "city": rng.choice(HOTEL_CITIES, n),
        }
    )


def add_same_region(joined: pd.DataFrame) -> pd.DataFrame:
    countries = joined["country"].to_numpy()
    cities = joined["city"].to_numpy()
    same = np.fromiter(
        (1 if city in COUNTRY_HOME_CITIES.get(c, ()) else 0 for c, city in zip(countries, cities)),
        dtype=np.int8,
        count=len(joined),
    )
    out = joined.copy()
    out["same_region"] = same
    return out


def build_feature_matrix(joined: pd.DataFrame) -> pd.DataFrame:
    """Return the joined dataframe restricted to FEATURE_ORDER columns, in canonical order.

    `joined` must already contain user features, hotel features, and `same_region`.
    """
    missing = [c for c in FEATURE_ORDER if c not in joined.columns]
    if missing:
        raise ValueError(f"Missing feature columns: {missing}")
    return joined[FEATURE_ORDER].astype(np.float32)


def _booking_logit(joined: pd.DataFrame, rng: np.random.Generator) -> np.ndarray:
    age = joined["age"].to_numpy(dtype=np.float32)
    pref_lux = joined["preference_luxury"].to_numpy(dtype=np.float32)
    pref_prox = joined["preference_proximity"].to_numpy(dtype=np.float32)
    hist = joined["historical_bookings_count"].to_numpy(dtype=np.float32)
    is_biz = joined["is_business_traveler"].to_numpy(dtype=np.float32)
    rating = joined["rating"].to_numpy(dtype=np.float32)
    price = joined["price_per_night"].to_numpy(dtype=np.float32)
    dist = joined["distance_to_center_km"].to_numpy(dtype=np.float32)
    pool = joined["has_pool"].to_numpy(dtype=np.float32)
    spa = joined["has_spa"].to_numpy(dtype=np.float32)
    biz_friendly = joined["is_business_friendly"].to_numpy(dtype=np.float32)
    fam_friendly = joined["is_family_friendly"].to_numpy(dtype=np.float32)
    same_region = joined["same_region"].to_numpy(dtype=np.float32)

    price_capped = np.minimum(price, 250.0)

    # Linear signal (LogReg-friendly).
    linear = (
        -1.7
        + 0.85 * (rating - 3.0)
        - 0.005 * price_capped
        - 0.05 * dist
        + 1.0 * (pref_lux - 0.5)
        + 0.6 * (pref_prox - 0.5) * (1.0 - dist / 25.0)
        + 0.04 * (hist - 5.0)
        + 1.0 * same_region
    )

    # Non-linear interactions (favor trees / NN).
    young = (age < 30).astype(np.float32)
    central = (dist < 5.0).astype(np.float32)
    cheap = (price < 200.0).astype(np.float32)
    proximity_lover = (pref_prox > 0.7).astype(np.float32)
    luxury_lover = (pref_lux > 0.6).astype(np.float32)

    nonlinear = (
        # Young business travelers want central biz-friendly hotels
        3.0 * young * is_biz * central * biz_friendly
        # Families want pool + reasonable price
        + 2.5 * fam_friendly * pool * cheap
        # Luxury preference squared interacts with price + spa
        + 2.2 * (pref_lux ** 2) * (price / 500.0) * spa
        # Proximity-lovers HATE far hotels (asymmetric penalty)
        - 1.8 * proximity_lover * (dist > 10.0).astype(np.float32)
        # Luxury-lovers HATE cheap unrated hotels
        - 1.5 * luxury_lover * (rating < 3.5).astype(np.float32) * cheap
    )

    # Smooth curved 3-way interactions. Monotone in each variable individually but with
    # high-order multiplicative coupling — trees approximate via many splits (cost AUC),
    # MLPs with smooth activations (sigmoid + ReLU compositions) represent naturally.
    rating_norm = (rating - 1.0) / 4.0  # [0, 1]
    price_norm = price / 500.0  # ~[0, 1]
    dist_norm = dist / 25.0  # ~[0, 1]
    # Quality-luxury polynomial of total order 5: pref_lux * rating² * (1 - price)².
    # Modest weight — LogReg captures part of its linear projections, so we don't want
    # this term to be dominant.
    poly = 1.5 * pref_lux * (rating_norm ** 2) * ((1.0 - price_norm) ** 2)
    # XOR-like cross-products centered at feature means: zero linear projection on
    # marginals (features are independent in the DGP), so LogReg cannot capture them
    # without explicit interaction terms. Trees do via depth-2 splits, MLP via hidden
    # units composing the two inputs.
    cross1 = 2.5 * (pref_lux - 0.3) * (price_norm - 0.45)
    cross2 = 2.5 * (rating_norm - 0.7) * (pref_prox - 0.5)
    smooth = poly + cross1 + cross2

    noise = rng.normal(0.0, 0.25, size=len(joined)).astype(np.float32)
    return linear + nonlinear + smooth + noise


def _generate_bookings(
    users: pd.DataFrame,
    hotels: pd.DataFrame,
    rng: np.random.Generator,
    n_obs: int = 50_000,
) -> pd.DataFrame:
    user_idx = rng.integers(0, len(users), n_obs)
    hotel_idx = rng.integers(0, len(hotels), n_obs)

    pairs = pd.DataFrame(
        {
            "user_id": users["user_id"].to_numpy()[user_idx],
            "hotel_id": hotels["hotel_id"].to_numpy()[hotel_idx],
        }
    )
    joined = pairs.merge(users, on="user_id", how="left").merge(hotels, on="hotel_id", how="left")
    joined = add_same_region(joined)

    logits = _booking_logit(joined, rng)
    probs = 1.0 / (1.0 + np.exp(-logits))
    booked = (rng.uniform(0.0, 1.0, len(joined)) < probs).astype(np.int8)

    bookings = joined[["user_id", "hotel_id"]].copy()
    bookings["booked"] = booked
    return bookings


def generate(seed: int = 42) -> SyntheticDataset:
    """Single entrypoint: returns synthetic users, hotels, and bookings.

    The generator injects a linear signal (LogReg-friendly) plus non-linear interactions
    (favorable to trees / MLP) and targets a positive booking rate of ~15-25%.
    """
    rng = np.random.default_rng(seed)
    users = _generate_users(rng)
    hotels = _generate_hotels(rng)
    bookings = _generate_bookings(users, hotels, rng)
    return SyntheticDataset(users=users, hotels=hotels, bookings=bookings)


def join_with_features(
    bookings: pd.DataFrame, users: pd.DataFrame, hotels: pd.DataFrame
) -> pd.DataFrame:
    """Join bookings → users → hotels, add `same_region`, and keep label.

    Returned columns include `user_id`, `hotel_id`, `booked`, every user/hotel column,
    and `same_region` so downstream code can call `build_feature_matrix` directly.
    """
    joined = bookings.merge(users, on="user_id", how="left").merge(hotels, on="hotel_id", how="left")
    return add_same_region(joined)
