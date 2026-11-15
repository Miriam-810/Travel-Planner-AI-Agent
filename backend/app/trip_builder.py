"""Turn a confirmed TripOutline into the finished Trip the frontend renders.

No LLM here. Weather comes from get_weather, place details (coordinates, maps
link, opening hours) from a PlaceResolver, lodging from the user's request.
Problems the user should know about (closed on arrival, closed for good,
holiday hours) become the day's warnings.
"""

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date

import httpx2

from app.models import Day, DayDraft, LodgingInput, PlaceHours, Stop, StopDraft, Trip, TripOutline, TripRequest, Weather
from app.tools.places import PlaceNotFound, get_place, needs_hours_caveat
from app.tools.weather import WeatherError, get_weather, today_in_japan


@dataclass(frozen=True)
class PlaceInfo:
    lat: float
    lng: float
    maps_url: str | None
    hours: PlaceHours | None


# Given a stop and its planned date, return its details: Google Places in real
# use, the bundled sample trip when no Places key is configured.
PlaceResolver = Callable[[StopDraft, date], Awaitable[PlaceInfo]]


async def build_trip(
    request: TripRequest,
    outline: TripOutline,
    *,
    client: httpx2.AsyncClient,
    resolve_place: PlaceResolver,
    today: date | None = None,
) -> Trip:
    today = today or today_in_japan()
    weathers = await asyncio.gather(
        *(_weather_or_none(d, client=client, today=today) for d in outline.days)
    )
    days = [
        await _build_day(i, d, w, request.lodgings, resolve_place, today)
        for i, (d, w) in enumerate(zip(outline.days, weathers, strict=True), start=1)
    ]
    return Trip(
        id=uuid.uuid4().hex[:12],
        destination=request.destination,
        start_date=request.start_date,
        end_date=request.end_date,
        travelers=request.travelers,
        days=days,
    )


async def _weather_or_none(day: DayDraft, *, client: httpx2.AsyncClient, today: date) -> Weather | None:
    try:
        return await get_weather(day.area_lat, day.area_lng, day.date, client=client, today=today)
    except WeatherError:
        return None  # the page shows "天氣無資料"; one failed lookup must not sink the trip


async def _build_day(
    n: int,
    draft: DayDraft,
    weather: Weather | None,
    lodgings: list[LodgingInput],
    resolve_place: PlaceResolver,
    today: date,
) -> Day:
    infos = await asyncio.gather(*(resolve_place(s, draft.date) for s in draft.stops))
    stops = [
        Stop(**s.model_dump(), id=f"d{n}-s{i}", lat=p.lat, lng=p.lng, maps_url=p.maps_url, hours=p.hours)
        for i, (s, p) in enumerate(zip(draft.stops, infos, strict=True), start=1)
    ]
    return Day(
        date=draft.date,
        title=draft.title,
        area=draft.area,
        weather=weather,
        lodging=lodging_for_night(draft.date, lodgings),
        stops=stops,
        warnings=day_warnings(draft.date, stops, today),
    )


STATUS_TEXT = {"CLOSED_TEMPORARILY": "暫停營業", "CLOSED_PERMANENTLY": "已歇業"}


def day_warnings(day: date, stops: list[Stop], today: date) -> list[str]:
    warnings = []
    for s in stops:
        if s.hours is None:
            continue
        if s.hours.business_status in STATUS_TEXT:
            warnings.append(f"{s.name}：Google 顯示{STATUS_TEXT[s.hours.business_status]}")
        elif s.hours.open_at_arrive is False:
            warnings.append(
                f"{s.name}：{s.arrive:%H:%M} 抵達、停留 {s.stay_min} 分鐘，可能遇到沒營業的時段"
                f"（當天 {s.hours.today_text}）"
            )
    if season := needs_hours_caveat(day, today):
        warnings.append(f"{season}期間，店家營業時間可能和平常不同，出發前請再確認。")
    return warnings


def lodging_for_night(night: date, lodgings: list[LodgingInput]) -> str | None:
    for lodging in lodgings:
        if lodging.check_in <= night < lodging.check_out:
            return lodging.name
    return None


def google_place_resolver(client: httpx2.AsyncClient, api_key: str) -> PlaceResolver:
    async def resolve(stop: StopDraft, day: date) -> PlaceInfo:
        place = await get_place(stop.place_id, client=client, api_key=api_key)
        return PlaceInfo(
            lat=place.lat,
            lng=place.lng,
            maps_url=place.maps_url,
            hours=place.hours_on(day, stop.arrive, stop.stay_min),
        )

    return resolve


def sample_place_resolver(sample: Trip) -> PlaceResolver:
    """Resolve the bundled sample trip's `sample-…` place ids (used when no Places key is set)."""
    by_place_id = {s.place_id: s for d in sample.days for s in d.stops}

    async def resolve(stop: StopDraft, _day: date) -> PlaceInfo:
        known = by_place_id.get(stop.place_id)
        if known is None:
            raise PlaceNotFound(stop.place_id)
        return PlaceInfo(lat=known.lat, lng=known.lng, maps_url=known.maps_url, hours=known.hours)

    return resolve
