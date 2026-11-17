import logging
from collections.abc import AsyncIterator, Callable, Coroutine
from contextlib import asynccontextmanager
from datetime import date, timedelta
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
from app.models import ChatTurn, Revision, Trip, TripOutline, TripRequest
from app.providers.base import PlaceNotFound, PlacesError, ProviderRegistry, Providers, UnsupportedCountry
from app.providers.registry import build_registry
from app.tools.weather import get_weather, today_in_japan
from app.trip_builder import build_trip

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


app = FastAPI(
    title="Travel Planner AI Agent",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

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
        {
            "outline": (settings.daily_limit_per_code, settings.daily_limit_site),
            "trips": (settings.daily_trips_per_code, settings.daily_trips_site),
            "revise": (settings.daily_revise_per_code, settings.daily_revise_site),
            "hotels": (settings.daily_hotels_per_code, settings.daily_hotels_site),
        },
    )


def require_invite_code(
    limiter: Annotated[UsageLimiter, Depends(get_limiter)],
    x_invite_code: Annotated[str | None, Header()] = None,
) -> str:
    try:
        return limiter.check_code(x_invite_code)
    except InvalidInviteCode as exc:
        raise HTTPException(status_code=401, detail="邀請碼無效") from exc


def get_registry(client: Annotated[httpx2.AsyncClient, Depends(get_http_client)]) -> ProviderRegistry:
    # Without a Places key only the sample trip's place ids resolve, so the
    # page can still be developed and demoed offline.
    return build_registry(client, places_api_key=settings.google_places_api_key, sample=load_sample_trip())


def providers_for(registry: ProviderRegistry, country: str) -> Providers:
    try:
        return registry.get(country)
    except UnsupportedCountry as exc:
        raise HTTPException(
            status_code=422, detail=f"目前只支援這些國家：{', '.join(registry.codes)}（收到 {country}）"
        ) from exc


AgentRunner = Callable[[TripRequest, Revision | None], Coroutine[None, None, AgentResult]]


def get_agent_runner(
    request: Request, registry: Annotated[ProviderRegistry, Depends(get_registry)]
) -> AgentRunner:
    llm = getattr(request.app.state, "anthropic", None)
    if llm is None or not settings.google_places_api_key:
        raise HTTPException(status_code=503, detail="伺服器尚未設定 Anthropic 或 Google Places key")
    http: httpx2.AsyncClient = request.app.state.http

    async def run(trip_request: TripRequest, revision: Revision | None = None) -> AgentResult:
        providers = providers_for(registry, trip_request.country)
        tz = providers.country.timezone

        async def weather(lat: float, lng: float, day: date):
            return await get_weather(lat, lng, day, client=http, tz=tz)

        return await run_agent(
            trip_request,
            llm=llm,
            model=settings.model,
            effort=settings.effort,
            providers=providers,
            weather=weather,
            today=providers.country.today(),
            revision=revision,
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
    # Claude's note to the traveller: the plan's idea, or what a revision changed.
    reply: str = ""


class ReviseBody(BaseModel):
    request: TripRequest
    outline: TripOutline
    message: str
    history: list[ChatTurn] = []


def _reserve(limiter: UsageLimiter, code: str, day: date, kind: str) -> None:
    try:
        limiter.reserve(code, day, kind)
    except DailyLimitReached as exc:
        what = {"revise": "修改次數", "hotels": "飯店搜尋次數"}.get(kind, "額度")
        detail = f"今天整個網站的{what}用完了" if exc.scope == "site" else f"這個邀請碼今天的{what}用完了"
        raise HTTPException(status_code=429, detail=detail) from exc


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
    return {"remaining_today": limiter.remaining(code, today_in_japan(), "outline")}


@app.post("/api/outline")
async def create_outline(
    trip_request: TripRequest,
    code: Annotated[str, Depends(require_invite_code)],
    limiter: Annotated[UsageLimiter, Depends(get_limiter)],
    run: Annotated[AgentRunner, Depends(get_agent_runner)],
) -> OutlineResponse:
    """Run the planning agent. Counts toward the daily limits; failed runs are not counted."""
    return await _run_counted(limiter, code, "outline", run(trip_request, None))


@app.post("/api/outline/revise")
async def revise_outline(
    body: ReviseBody,
    code: Annotated[str, Depends(require_invite_code)],
    limiter: Annotated[UsageLimiter, Depends(get_limiter)],
    run: Annotated[AgentRunner, Depends(get_agent_runner)],
) -> OutlineResponse:
    """Change an outline the traveller already has, from a chat message (e.g. 「第三天下午想換成嵐山」).
    Has its own daily limit; failed runs are not counted."""
    want = [body.request.start_date + timedelta(days=i) for i in range((body.request.end_date - body.request.start_date).days + 1)]
    if [d.date for d in body.outline.days] != want:
        raise HTTPException(status_code=422, detail="outline dates must match the request, one day each, in order")
    try:
        revision = Revision(outline=body.outline, message=body.message.strip(), history=body.history)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="訊息請在 1–500 字之間") from exc
    return await _run_counted(limiter, code, "revise", run(body.request, revision))


async def _run_counted(
    limiter: UsageLimiter, code: str, kind: str, job: Coroutine[None, None, AgentResult]
) -> OutlineResponse:
    day = today_in_japan()
    try:
        _reserve(limiter, code, day, kind)
    except HTTPException:
        job.close()  # never awaited: don't leave the coroutine dangling
        raise

    try:
        result = await job
    except BaseException as exc:
        limiter.release(code, day, kind)
        if isinstance(exc, AgentRefused):
            raise HTTPException(status_code=422, detail="AI 無法處理這個需求，請調整內容後再試") from exc
        if isinstance(exc, (AgentError, PlacesError, anthropic.APIError)):
            logging.getLogger(__name__).exception("%s failed", kind)
            raise HTTPException(status_code=502, detail="排行程時發生錯誤，請稍後再試（這次不計入額度）") from exc
        raise

    s = result.stats
    return OutlineResponse(
        outline=result.outline,
        warnings=result.warnings,
        reply=result.summary,
        remaining_today=limiter.remaining(code, day, kind),
        stats=OutlineStats(
            model=s.model,
            turns=s.turns,
            tool_calls=s.tool_calls,
            searches=s.searches,
            claude_usd=s.claude_usd,
            places_usd=s.places_usd,
        ),
    )


class HotelResult(BaseModel):
    place_id: str
    name: str
    address: str
    lat: float
    lng: float


MAX_HOTEL_RESULTS = 6


class HotelSearch(BaseModel):
    q: str
    destination: str = ""
    country: str = "JP"


@app.post("/api/hotels")
async def search_hotels(
    body: HotelSearch,
    code: Annotated[str, Depends(require_invite_code)],
    limiter: Annotated[UsageLimiter, Depends(get_limiter)],
    registry: Annotated[ProviderRegistry, Depends(get_registry)],
) -> list[HotelResult]:
    """Find a booked hotel by name, so the plan knows where each day ends.
    One Places text search per call, with its own daily limit. (POST, so hotel
    names stay out of URLs and logs.)"""
    q, destination, country = body.q.strip()[:100], body.destination.strip()[:50], body.country
    if len(q) < 2:
        raise HTTPException(status_code=422, detail="請輸入至少兩個字的飯店名稱")
    providers = providers_for(registry, country)
    day = today_in_japan()
    _reserve(limiter, code, day, "hotels")
    lat, lng = providers.country.centre
    try:
        found = await providers.places.search(f"{q} {destination}".strip(), lat, lng, radius_m=50_000)
    except PlacesError as exc:
        limiter.release(code, day, "hotels")
        raise HTTPException(status_code=502, detail="搜尋暫時無法使用，可以先直接填飯店名稱") from exc
    return [
        HotelResult(place_id=p.place_id, name=p.name, address=p.address, lat=p.lat, lng=p.lng)
        for p in found[:MAX_HOTEL_RESULTS]
    ]


@app.post("/api/trips")
async def create_trip(
    body: BuildTripBody,
    code: Annotated[str, Depends(require_invite_code)],
    limiter: Annotated[UsageLimiter, Depends(get_limiter)],
    client: Annotated[httpx2.AsyncClient, Depends(get_http_client)],
    registry: Annotated[ProviderRegistry, Depends(get_registry)],
) -> Trip:
    """Build the finished itinerary from a confirmed outline: adds weather, place details and lodging.
    Has its own daily limit, separate from POST /api/outline; failed builds are not counted."""
    want = [body.request.start_date + timedelta(days=i) for i in range((body.request.end_date - body.request.start_date).days + 1)]
    if [d.date for d in body.outline.days] != want:
        raise HTTPException(status_code=422, detail="outline dates must match the request, one day each, in order")
    providers = providers_for(registry, body.request.country)

    day = today_in_japan()
    _reserve(limiter, code, day, "trips")
    try:
        return await build_trip(body.request, body.outline, client=client, providers=providers)
    except BaseException as exc:
        limiter.release(code, day, "trips")
        if isinstance(exc, PlaceNotFound):
            raise HTTPException(status_code=422, detail=f"unknown place_id: {exc}") from exc
        if isinstance(exc, PlacesError):
            raise HTTPException(status_code=502, detail="Google Places is unavailable, please try again") from exc
        raise
