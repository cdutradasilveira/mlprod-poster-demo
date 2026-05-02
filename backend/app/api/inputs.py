"""Sample inputs for the demo's UI dropdowns.

Returns a curated mix of users and hotels:
  - 30 users — ~20 from the precomputed range (id < 1000) and ~10 from the not-precomputed
    range (id ≥ 1000), each flagged with `precomputed_in_lookup`.
  - 30 hotels — sampled deterministically.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.models_io.registry import get_store

router = APIRouter()

PRECOMPUTED_USER_LIMIT = 1000  # users < this are guaranteed in lookup tables
N_PRECOMPUTED = 20
N_NON_PRECOMPUTED = 10
N_HOTELS = 30


def _pick_evenly(ids: list[int], n: int) -> list[int]:
    if len(ids) <= n:
        return list(ids)
    step = len(ids) / n
    return [ids[int(i * step)] for i in range(n)]


@router.get("/sample-inputs")
def sample_inputs() -> dict:
    store = get_store()
    pre_ids = [u for u in store.user_ids if u < PRECOMPUTED_USER_LIMIT]
    non_pre_ids = [u for u in store.user_ids if u >= PRECOMPUTED_USER_LIMIT]
    user_ids = _pick_evenly(pre_ids, N_PRECOMPUTED) + _pick_evenly(
        non_pre_ids, N_NON_PRECOMPUTED
    )
    hotel_ids = _pick_evenly(store.hotel_ids, N_HOTELS)

    users = []
    for uid in user_ids:
        u = store.get_user(uid)
        users.append(
            {
                "user_id": int(uid),
                "precomputed_in_lookup": uid < PRECOMPUTED_USER_LIMIT,
                "age": int(u["age"]),
                "preference_luxury": float(u["preference_luxury"]),
                "preference_proximity": float(u["preference_proximity"]),
                "historical_bookings_count": int(u["historical_bookings_count"]),
                "is_business_traveler": int(u["is_business_traveler"]),
                "country": str(u["country"]),
            }
        )

    hotels = []
    for hid in hotel_ids:
        h = store.get_hotel(hid)
        hotels.append(
            {
                "hotel_id": int(hid),
                "rating": float(h["rating"]),
                "price_per_night": float(h["price_per_night"]),
                "distance_to_center_km": float(h["distance_to_center_km"]),
                "has_pool": int(h["has_pool"]),
                "has_spa": int(h["has_spa"]),
                "is_business_friendly": int(h["is_business_friendly"]),
                "is_family_friendly": int(h["is_family_friendly"]),
                "city": str(h["city"]),
            }
        )

    return {"users": users, "hotels": hotels}
