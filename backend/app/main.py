from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import Trip

settings = get_settings()

SAMPLE_TRIP_PATH = Path(__file__).parent / "fixtures" / "sample_trip.json"

app = FastAPI(title="Travel Planner AI Agent", version="0.1.0")

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Invite-Code"],
    )


@lru_cache
def load_sample_trip() -> Trip:
    return Trip.model_validate_json(SAMPLE_TRIP_PATH.read_text(encoding="utf-8"))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.model}


@app.get("/api/trips/sample")
def get_sample_trip() -> Trip:
    """Bundled demo itinerary (青森・函館). Public, no invite code needed."""
    return load_sample_trip()
