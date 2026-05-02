"""Scripted serving: wraps the native MLP and applies three business rules on top.

Rules (applied in order, each appended to metadata.applied_rules):
  1. Cold-start blend: if user has 0 historical bookings, blend with global popularity.
  2. Diversity penalty: if user country and hotel city are in distant regions, multiply by 0.85.
  3. Floor / ceiling: clip to [0.01, 0.99].

Each rule adds a few microseconds — that accumulation is part of the lesson per the paper §3.4
("scripted methods accumulate cost line by line").
"""
from __future__ import annotations

import os
import time
from inspect import getsourcefile

import pandas as pd

from app.config import settings
from app.models_io.registry import get_store
from app.serving.base import PredictionResult, RadarAxes, Server
from app.serving.native import NativeServer

# Static axes for Scripted, per CLAUDE.md §8.
STATIC_AXES = RadarAxes(
    modeling_flexibility=1.0,
    input_space_flexibility=1.0,
    stack_flexibility=-1.0,
    consistency=0.0,
    observability=-1.0,
)

# Broad continent grouping used for the diversity penalty. Cities outside the user's
# group are considered "distant" and incur a 0.85× multiplier.
SAME_CONTINENT: dict[str, set[str]] = {
    "US": {"NYC", "TOR", "RIO"},
    "CA": {"NYC", "TOR", "RIO"},
    "BR": {"NYC", "TOR", "RIO"},
    "UK": {"LDN", "BER", "PAR", "MAD", "ROM"},
    "DE": {"LDN", "BER", "PAR", "MAD", "ROM"},
    "FR": {"LDN", "BER", "PAR", "MAD", "ROM"},
    "ES": {"LDN", "BER", "PAR", "MAD", "ROM"},
    "IT": {"LDN", "BER", "PAR", "MAD", "ROM"},
    "JP": {"TKY", "SYD"},
    "AU": {"TKY", "SYD"},
}

DIVERSITY_PENALTY = 0.85
COLD_START_THRESHOLD = 0
COLD_START_BLEND = 0.7  # weight on popularity prior when user is cold


class ScriptedServer(Server):
    method_name = "scripted"
    # The compatibility matrix (CLAUDE.md §2) marks Scripted as valid for all four
    # models. The canonical example in §7.4 uses the MLP, but the same wrapping
    # (cold-start blend + diversity penalty + clip) applies cleanly on top of any
    # NativeServer.

    def __init__(self, model_name: str = "mlp") -> None:
        self.model_name = model_name
        self._native = NativeServer(model_name)
        self._store = get_store()
        self._popularity = self._compute_popularity()

    def _compute_popularity(self) -> float:
        path = settings.artifacts_dir / "data" / "bookings.parquet"
        if not path.exists():
            return 0.2
        return float(pd.read_parquet(path)["booked"].mean())

    def predict(self, user_id: int, hotel_id: int) -> PredictionResult:
        t0 = time.perf_counter()
        applied: list[str] = []
        user = self._store.get_user(user_id)
        hotel = self._store.get_hotel(hotel_id)

        base_result = self._native.predict(user_id, hotel_id)
        prob = base_result.probability
        applied.append(
            f"base:{self._native.method_name}:{self._native.model_name}"
            f"({base_result.latency_ms:.2f}ms)"
        )

        # Rule 1: cold-start blend
        if int(user["historical_bookings_count"]) <= COLD_START_THRESHOLD:
            prob = COLD_START_BLEND * self._popularity + (1 - COLD_START_BLEND) * prob
            applied.append(f"cold_start_blend(pop={self._popularity:.3f})")

        # Rule 2: diversity penalty
        country = str(user["country"])
        city = str(hotel["city"])
        same_continent = city in SAME_CONTINENT.get(country, set())
        if not same_continent:
            prob = prob * DIVERSITY_PENALTY
            applied.append(f"diversity_penalty(*{DIVERSITY_PENALTY})")

        # Rule 3: floor / ceiling
        clipped = max(0.01, min(0.99, prob))
        if clipped != prob:
            applied.append("clip[0.01,0.99]")
        prob = clipped

        latency_ms = (time.perf_counter() - t0) * 1000.0
        return PredictionResult(
            probability=float(prob),
            latency_ms=latency_ms,
            metadata={"applied_rules": applied},
        )

    def artifact_size_bytes(self) -> int:
        script_path = getsourcefile(type(self))
        script_size = os.path.getsize(script_path) if script_path else 0
        return script_size + self._native.artifact_size_bytes()

    @property
    def static_axes(self) -> RadarAxes:
        return STATIC_AXES
