import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Annotated

import anthropic
import httpx2
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.agent.loop import AgentError, AgentRefused, AgentResult, run_agent
from app.config import get_settings
from app.limits import DailyLimitReached, InvalidInviteCode, UsageLimiter
from app.models import Trip, TripOutline, TripRequest
from app.tools.places import PlaceNotFound, PlacesError, search_place
from app.tools.weather import get_weather, today_in_japan
from app.trip_builder import PlaceResolver, build_trip, google_place_resolver, sample_place_resolver

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()

SAMPLE_TRIP_PATH = Path(__file__).parent / "fixtures" / "sample_trip.json"
AGENT_REQUEST_TIMEOUT_S = 180.0


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Shared clients for outbound calls: Open-Meteo and Google Places, and Claude.
    async with httpx2.AsyncClient() as client:
        app.state.http = client
        app.state.anthropic = (
            anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=AGENT_REQUEST_TIMEOUT_S)
            if settings.anthropic_api_key
            else None
        )
        yield
        if app.state.anthropic is not None:
            await app.state.anthropic.close()


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


# --- dependencies --------------------------------------------------------------


def get_http_client(request: Request) -> httpx2.AsyncClient:
    return request.app.state.http


@lru_cache
def get_limiter() -> UsageLimiter:
    return UsageLimiter(
        settings.usage_db_path,
        settings.invite_code_set,
        per_code=settings.daily_limit_per_code,
        per_site=settings.daily_limit_site,
    )


def require_invite_code(
    limiter: Annotated[UsageLimiter, Depends(get_limiter)],
    x_invite_code: Annotated[str | None, Header()] = None,
) -> str:
    try:
        return limiter.check_code(x_invite_code)
    except InvalidInviteCode as exc:
        raise HTTPException(status_code=401, detail="邀請碼無效") from exc


def get_place_resolver(client: Annotated[httpx2.AsyncClient, Depends(get_http_client)]) -> PlaceResolver:
    # Without a Places key only the sample trip's place ids resolve, so the
    # page can still be developed and demoed offline.
    if settings.google_places_api_key:
        return google_place_resolver(client, settings.google_places_api_key)
    return sample_place_resolver(load_sample_trip())


AgentRunner = Callable[[TripRequest], Awaitable[AgentResult]]


def get_agent_runner(request: Request) -> AgentRunner:
    llm = getattr(request.app.state, "anthropic", None)
    if llm is None or not settings.google_places_api_key:
        raise HTTPException(status_code=503, detail="伺服器尚未設定 Anthropic 或 Google Places key")
    http: httpx2.AsyncClient = request.app.state.http
    key = settings.google_places_api_key

    async def search(query: str, lat: float, lng: float, radius_m: int):
        return await search_place(query, lat, lng, radius_m=radius_m, client=http, api_key=key)

    async def weather(lat: float, lng: float, day: date):
        return await get_weather(lat, lng, day, client=http)

    async def run(trip_request: TripRequest) -> AgentResult:
        return await run_agent(
            trip_request,
            llm=llm,
            model=settings.model,
            effort=settings.effort,
            search=search,
            weather=weather,
            today=today_in_japan(),
        )

    return run


# --- routes --------------------------------------------------------------------


class BuildTripBody(BaseModel):
    request: TripRequest
    outline: TripOutline


class OutlineStats(BaseModel):
    model: str
    turns: int
    tool_calls: int
    searches: int
    claude_usd: float | None
    places_usd: float


class OutlineResponse(BaseModel):
    outline: TripOutline
    warnings: list[str]
    remaining_today: int
    stats: OutlineStats


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.model}


@app.get("/api/trips/sample")
def get_sample_trip() -> Trip:
    """Bundled demo itinerary (青森・函館). Public, no invite code needed."""
    return load_sample_trip()


@app.get("/api/invite")
def check_invite(
    code: Annotated[str, Depends(require_invite_code)],
    limiter: Annotated[UsageLimiter, Depends(get_limiter)],
) -> dict[str, int]:
    """Validate an invite code and say how many outlines it can still generate today."""
    return {"remaining_today": limiter.remaining(code, today_in_japan())}


@app.post("/api/outline")
async def create_outline(
    trip_request: TripRequest,
    code: Annotated[str, Depends(require_invite_code)],
    limiter: Annotated[UsageLimiter, Depends(get_limiter)],
    run: Annotated[AgentRunner, Depends(get_agent_runner)],
) -> OutlineResponse:
    """Run the planning agent. Counts toward the daily limits; failed runs are not counted."""
    day = today_in_japan()
    try:
        limiter.reserve(code, day)
    except DailyLimitReached as exc:
        detail = "今天整個網站的額度用完了" if exc.scope == "site" else "這個邀請碼今天的額度用完了"
        raise HTTPException(status_code=429, detail=detail) from exc

    try:
        result = await run(trip_request)
    except BaseException as exc:
        limiter.release(code, day)
        if isinstance(exc, AgentRefused):
            raise HTTPException(status_code=422, detail="AI 無法處理這個需求，請調整內容後再試") from exc
        if isinstance(exc, (AgentError, PlacesError, anthropic.APIError)):
            logging.getLogger(__name__).exception("outline failed")
            raise HTTPException(status_code=502, detail="排行程時發生錯誤，請稍後再試（這次不計入額度）") from exc
        raise

    s = result.stats
    return OutlineResponse(
        outline=result.outline,
        warnings=result.warnings,
        remaining_today=limiter.remaining(code, day),
        stats=OutlineStats(
            model=s.model,
            turns=s.turns,
            tool_calls=s.tool_calls,
            searches=s.searches,
            claude_usd=s.claude_usd,
            places_usd=s.places_usd,
        ),
    )


@app.post("/api/trips")
async def create_trip(
    body: BuildTripBody,
    _code: Annotated[str, Depends(require_invite_code)],
    client: Annotated[httpx2.AsyncClient, Depends(get_http_client)],
    resolve_place: Annotated[PlaceResolver, Depends(get_place_resolver)],
) -> Trip:
    """Build the finished itinerary from a confirmed outline: adds weather, place details and lodging.
    Needs an invite code but does not count toward the daily limit."""
    try:
        return await build_trip(body.request, body.outline, client=client, resolve_place=resolve_place)
    except PlaceNotFound as exc:
        raise HTTPException(status_code=422, detail=f"unknown place_id: {exc}") from exc
    except PlacesError as exc:
        raise HTTPException(status_code=502, detail="Google Places is unavailable, please try again") from exc
