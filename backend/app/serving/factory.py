"""Server factory: loaded once at startup, indexed by (model, method).

The factory builds one server per *valid* (model, method) cell of the compatibility
matrix and caches them. This warms the artifacts (sklearn pickles, XGBoost JSON,
torch state dict) so individual requests don't pay loading time.
"""
from __future__ import annotations

import logging
from typing import Iterable

from app.api.compatibility import is_compatible, valid_combinations
from app.serving.base import Server
from app.serving.glm import GLMServer
from app.serving.lookup import LookupServer
from app.serving.native import NativeServer
from app.serving.scripted import ScriptedServer

logger = logging.getLogger("ml-prod-demo.factory")


def _build(model: str, method: str) -> Server:
    if method == "lookup":
        return LookupServer(model)
    if method == "glm":
        return GLMServer()
    if method == "native":
        return NativeServer(model)
    if method == "scripted":
        return ScriptedServer(model)
    raise ValueError(f"Unknown method: {method!r}")


class ServerFactory:
    def __init__(self) -> None:
        self._servers: dict[tuple[str, str], Server] = {}

    def warm(self) -> None:
        """Load every valid (model, method) server once."""
        for model, method in valid_combinations():
            try:
                self._servers[(model, method)] = _build(model, method)
                logger.info("Warmed server: model=%s method=%s", model, method)
            except Exception:
                logger.exception("Failed to warm model=%s method=%s", model, method)
                raise

    def get(self, model: str, method: str) -> Server:
        compatible, reason = is_compatible(model, method)
        if not compatible:
            raise ValueError(reason or f"Invalid combination: {model}×{method}")
        if (model, method) not in self._servers:
            # Lazy fallback (also useful for tests that skip warm()).
            self._servers[(model, method)] = _build(model, method)
        return self._servers[(model, method)]

    def loaded_combinations(self) -> Iterable[tuple[str, str]]:
        return tuple(self._servers.keys())


_factory: ServerFactory | None = None


def get_factory() -> ServerFactory:
    global _factory
    if _factory is None:
        _factory = ServerFactory()
    return _factory


def reset_factory_for_tests() -> None:
    global _factory
    _factory = None
