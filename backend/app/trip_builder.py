"""Turn a confirmed TripOutline into the finished Trip the frontend renders.

No LLM here. Weather comes from get_weather, place details (coordinates, maps
link, opening hours) from the country's PlaceProvider, lodging from the user's
request. Problems the user should know about (closed on arrival, closed for
good, holiday hours) become the day's warnings.
"""

import asyncio
import uuid
from datetime import date

import httpx2

from app.models import Day, DayDraft, LodgingInput, Stop, Trip, TripOutline, TripRequest, Weather
from app.providers.base import Country, Providers
from app.tools.weather import WeatherError, get_weather


async def build_trip(
    request: TripRequest,
    outline: TripOutline,
    *,
    client: httpx2.AsyncClient,
    providers: Providers,
    today: date | None = None,
) -> Trip:
    country = providers.country
    today = today or country.today()
    weathers = await asyncio.gather(*(_weather_or_none(d, client, country, today) for d in outline.days))
    days = [
        await _build_day(i, d, w, request.lodgings, providers, today)
        for i, (d, w) in enumerate(zip(outline.days, weathers, strict=True), start=1)
    ]
    return Trip(
        id=uuid.uuid4().hex[:12],
        country=country.code,
        destination=request.destination,
        start_date=request.start_date,
        end_date=request.end_date,
        travelers=request.travelers,
        days=days,
    )


async def _weather_or_none(day: DayDraft, client: httpx2.AsyncClient, country: Country, today: date) -> Weather | None:
    try:
        return await get_weather(day.area_lat, day.area_lng, day.date, client=client, today=today, tz=country.timezone)
    except WeatherError:
        return None  # the page shows "天氣無資料"; one failed lookup must not sink the trip


async def _build_day(
    n: int,
    draft: DayDraft,
    weather: Weather | None,
    lodgings: list[LodgingInput],
    providers: Providers,
    today: date,
) -> Day:
    places = await asyncio.gather(*(providers.places.get(s.place_id) for s in draft.stops))
    stops = [
        Stop(
            **s.model_dump(),
            id=f"d{n}-s{i}",
            lat=p.lat,
            lng=p.lng,
            maps_url=p.maps_url,
            hours=p.hours_on(draft.date, s.arrive, s.stay_min, today=today),
        )
        for i, (s, p) in enumerate(zip(draft.stops, places, strict=True), start=1)
    ]
    return Day(
        date=draft.date,
        title=draft.title,
        area=draft.area,
        weather=weather,
        lodging=lodging_for_night(draft.date, lodgings),
        stops=stops,
        warnings=day_warnings(draft.date, stops, providers.country, today),
    )


STATUS_TEXT = {"CLOSED_TEMPORARILY": "暫停營業", "CLOSED_PERMANENTLY": "已歇業"}


def day_warnings(day: date, stops: list[Stop], country: Country, today: date) -> list[str]:
    warnings = []
    for s in stops:
        if s.hours is None:
            continue
        if s.hours.business_status in STATUS_TEXT:
            warnings.append(f"{s.name}：地圖資料顯示{STATUS_TEXT[s.hours.business_status]}")
        elif s.hours.open_at_arrive is False:
            warnings.append(
                f"{s.name}：{s.arrive:%H:%M} 抵達、停留 {s.stay_min} 分鐘，可能遇到沒營業的時段"
                f"（當天 {s.hours.today_text}）"
            )
    if season := country.hours_caveat(day, today):
        warnings.append(f"{season}期間，店家營業時間可能和平常不同，出發前請再確認。")
    return warnings


def lodging_for_night(night: date, lodgings: list[LodgingInput]) -> str | None:
    for lodging in lodgings:
        if lodging.check_in <= night < lodging.check_out:
            return lodging.name
    return None
