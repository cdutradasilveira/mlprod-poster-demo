from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


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
