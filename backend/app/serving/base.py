from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class RadarAxes:
    """Per-method static trade-off scores in [-1, +1] (paper, Section 4)."""

    modeling_flexibility: float
    input_space_flexibility: float
    stack_flexibility: float
    consistency: float
    observability: float

    def as_dict(self) -> dict[str, float]:
        return {
            "modeling_flexibility": self.modeling_flexibility,
            "input_space_flexibility": self.input_space_flexibility,
            "stack_flexibility": self.stack_flexibility,
            "consistency": self.consistency,
            "observability": self.observability,
        }


@dataclass
class PredictionResult:
    probability: float | None
    latency_ms: float
    metadata: dict = field(default_factory=dict)


class Server(ABC):
    method_name: str
    model_name: str

    @abstractmethod
    def predict(self, user_id: int, hotel_id: int) -> PredictionResult: ...

    @abstractmethod
    def artifact_size_bytes(self) -> int: ...

    @property
    @abstractmethod
    def static_axes(self) -> RadarAxes: ...
