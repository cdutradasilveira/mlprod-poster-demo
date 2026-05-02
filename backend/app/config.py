from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _default_artifacts_dir() -> Path:
    here = Path(__file__).resolve().parent.parent
    return here / "artifacts"


def _parse_origins(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    redis_url: str
    artifacts_dir: Path
    log_level: str
    cors_origins: list[str]


def load_settings() -> Settings:
    return Settings(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        artifacts_dir=Path(os.getenv("ARTIFACTS_DIR", str(_default_artifacts_dir()))),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        cors_origins=_parse_origins(
            os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://localhost:5174,http://localhost:5175",
            )
        ),
    )


settings = load_settings()
