from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Annotated

import httpx2
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_settings
from app.models import Trip, TripOutline, TripRequest
from app.trip_builder import PlaceNotFound, PlaceResolver, build_trip, sample_place_resolver

settings = get_settings()

SAMPLE_TRIP_PATH = Path(__file__).parent / "fixtures" / "sample_trip.json"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One shared HTTP client for outbound API calls (Open-Meteo, later Places).
    async with httpx2.AsyncClient() as client:
        app.state.http = client
        yield


app = FastAPI(title="Travel Planner AI Agent", version="0.1.0", lifespan=lifespan)

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


def get_http_client(request: Request) -> httpx2.AsyncClient:
    return request.app.state.http


def get_place_resolver() -> PlaceResolver:
    # Step 6 swaps this for the Google Places resolver.
    return sample_place_resolver(load_sample_trip())


class BuildTripBody(BaseModel):
    request: TripRequest
    outline: TripOutline


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.model}


@app.get("/api/trips/sample")
def get_sample_trip() -> Trip:
    """Bundled demo itinerary (青森・函館). Public, no invite code needed."""
    return load_sample_trip()


@app.post("/api/trips")
async def create_trip(
    body: BuildTripBody,
    client: Annotated[httpx2.AsyncClient, Depends(get_http_client)],
    resolve_place: Annotated[PlaceResolver, Depends(get_place_resolver)],
) -> Trip:
    """Build the finished itinerary from a confirmed outline: adds weather, place details and lodging."""
    try:
        return await build_trip(body.request, body.outline, client=client, resolve_place=resolve_place)
    except PlaceNotFound as exc:
        raise HTTPException(status_code=422, detail=f"unknown place_id: {exc}") from exc
