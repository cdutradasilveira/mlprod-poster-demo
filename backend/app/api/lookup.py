"""Lookup-table status — used by the frontend to show a banner when the table is empty."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.compatibility import MODELS
from app.serving.lookup import get_lookup_tables

router = APIRouter()


@router.get("/lookup/status")
def lookup_status() -> dict:
    tables = get_lookup_tables()

    per_model: dict[str, bool] = {}
    total_keys = 0
    for m in MODELS:
        present = m in tables
        per_model[m] = present
        if present:
            import numpy as np
            total_keys += int(np.sum(~np.isnan(tables[m])))

    populated = all(per_model.values())
    return {
        "populated": populated,
        "key_count": total_keys,
        "per_model": per_model,
    }
