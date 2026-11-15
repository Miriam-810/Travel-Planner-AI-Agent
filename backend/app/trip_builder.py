"""Turn a confirmed TripOutline into the finished Trip the frontend renders.

No LLM here. Weather comes from get_weather, place details (coordinates, maps
link, opening hours) from a PlaceResolver, lodging from the user's request.
"""

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date

import httpx2

from app.models import Day, DayDraft, LodgingInput, PlaceHours, Stop, StopDraft, Trip, TripOutline, TripRequest, Weather
from app.tools.weather import WeatherError, get_weather


@dataclass(frozen=True)
class PlaceInfo:
    lat: float
    lng: float
    maps_url: str | None
    hours: PlaceHours | None


class PlaceNotFound(Exception):
    pass


# Given a stop and its planned date, return its details. Step 6 plugs in Google
# Places; until then the sample resolver below is used.
PlaceResolver = Callable[[StopDraft, date], Awaitable[PlaceInfo]]


async def build_trip(
    request: TripRequest,
    outline: TripOutline,
    *,
    client: httpx2.AsyncClient,
    resolve_place: PlaceResolver,
    today: date | None = None,
) -> Trip:
    weathers = await asyncio.gather(
        *(_weather_or_none(d, client=client, today=today) for d in outline.days)
    )
    days = [
        await _build_day(i, d, w, request.lodgings, resolve_place)
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


async def _weather_or_none(day: DayDraft, *, client: httpx2.AsyncClient, today: date | None) -> Weather | None:
    try:
        return await get_weather(day.area_lat, day.area_lng, day.date, client=client, today=today)
    except WeatherError:
        return None  # the page shows "天氣無資料"; one failed lookup must not sink the trip


async def _build_day(
    n: int, draft: DayDraft, weather: Weather | None, lodgings: list[LodgingInput], resolve_place: PlaceResolver
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
    )


def lodging_for_night(night: date, lodgings: list[LodgingInput]) -> str | None:
    for lodging in lodgings:
        if lodging.check_in <= night < lodging.check_out:
            return lodging.name
    return None


def sample_place_resolver(sample: Trip) -> PlaceResolver:
    """Resolve the bundled sample trip's `sample-…` place ids. Replaced by Google Places in step 6."""
    by_place_id = {s.place_id: s for d in sample.days for s in d.stops}

    async def resolve(stop: StopDraft, _day: date) -> PlaceInfo:
        known = by_place_id.get(stop.place_id)
        if known is None:
            raise PlaceNotFound(stop.place_id)
        return PlaceInfo(lat=known.lat, lng=known.lng, maps_url=known.maps_url, hours=known.hours)

    return resolve
