from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    compare as compare_api,
    inputs as inputs_api,
    lookup as lookup_api,
    methods as methods_api,
    metrics_api,
    models as models_api,
    predict as predict_api,
    stress as stress_api,
)
from app.config import settings
from app.models_io.registry import get_store
from app.serving.factory import get_factory

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ml-prod-demo")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Backend starting (log_level=%s)", settings.log_level)
    logger.info("Artifacts dir: %s", settings.artifacts_dir)
    logger.info("Redis URL: %s", settings.redis_url)
    logger.info("CORS origins: %s", settings.cors_origins)
    # Warm caches: load feature store, build all valid (model, method) servers.
    try:
        store = get_store()
        logger.info(
            "Feature store ready: %d users, %d hotels", store.n_users, store.n_hotels
        )
    except Exception:
        logger.exception("Feature store failed to load (run scripts/generate_data.py first?)")
    try:
        get_factory().warm()
    except Exception:
        logger.exception("Server factory warm failed (run scripts/train_all.py first?)")
    yield
    logger.info("Backend shutting down")


app = FastAPI(
    title="ML Productionization Demo",
    description="Booking.com ML productionization methods — interactive demo backend.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")


@api_router.get("/health")
def health() -> dict:
    return {"status": "ok"}


# Wire up domain routers (they bring their own paths under /api/...).
api_router.include_router(methods_api.router)
api_router.include_router(models_api.router)
api_router.include_router(inputs_api.router)
api_router.include_router(predict_api.router)
api_router.include_router(stress_api.router)
api_router.include_router(compare_api.router)
api_router.include_router(lookup_api.router)
api_router.include_router(metrics_api.router)

app.include_router(api_router)
