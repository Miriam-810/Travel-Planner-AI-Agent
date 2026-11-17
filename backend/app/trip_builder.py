"""Turn a confirmed TripOutline into the finished Trip the frontend renders.

No LLM here. Weather comes from get_weather, place details (coordinates, maps
link, opening hours) from the country's PlaceProvider, lodging from the user's
request, and how to get between places from app.legs (public transport where
the country has a router). Problems the user should know about (closed on arrival, closed for
good, holiday hours) become the day's warnings.
"""

import asyncio
import uuid
from datetime import date, timedelta

import httpx2

from app.legs import day_legs, distance_m
from app.models import Day, DayDraft, LodgingInput, Stop, Trip, TripOutline, TripRequest, Weather
from app.providers.base import Country, LatLng, PlacesError, Providers
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
    weathers, lodgings = await asyncio.gather(
        asyncio.gather(*(_weather_or_none(d, client, country, today) for d in outline.days)),
        locate_lodgings(request.lodgings, outline, request.destination, providers),
    )
    days = [
        await _build_day(i, d, w, lodgings, providers, today)
        for i, (d, w) in enumerate(zip(outline.days, weathers, strict=True), start=1)
    ]
    return Trip(
        id=uuid.uuid4().hex[:12],
        country=country.code,
        theme=outline.theme,
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
    into, to_hotel = await day_legs(
        draft.date,
        stops,
        morning_hotel=lodging_input_for_night(draft.date - timedelta(days=1), lodgings),
        night_hotel=lodging_input_for_night(draft.date, lodgings),
        tz=providers.country.timezone,
        routes=providers.routes,
    )
    stops = [s.model_copy(update={"leg": leg}) for s, leg in zip(stops, into, strict=True)]
    return Day(
        date=draft.date,
        title=draft.title,
        area=draft.area,
        weather=weather,
        lodging=lodging_for_night(draft.date, lodgings),
        stops=stops,
        warnings=day_warnings(draft.date, stops, providers.country, today),
        leg_to_hotel=to_hotel,
    )


# A typed hotel name is trusted only if the best match is this close to where
# that night's day is planned: a same-name hotel in another city is worse than none.
HOTEL_NEAR_M = 30_000


async def locate_lodgings(
    lodgings: list[LodgingInput], outline: TripOutline, destination: str, providers: Providers
) -> list[LodgingInput]:
    """Find where each hotel typed by hand is (one place search each), so the day can
    start and end there. Hotels picked from the search already know their place."""

    async def locate(lodging: LodgingInput) -> LodgingInput:
        if lodging.lat is not None and lodging.lng is not None:
            return lodging
        day = next((d for d in outline.days if d.date == lodging.check_in), None)
        near = LatLng(day.area_lat, day.area_lng) if day else LatLng(*providers.country.centre)
        try:
            found = await providers.places.search(f"{lodging.name} {destination}".strip(), near.lat, near.lng, radius_m=30_000)
        except PlacesError:
            return lodging
        if not found:
            return lodging
        best = found[0]
        if day is not None and distance_m(near, LatLng(best.lat, best.lng)) > HOTEL_NEAR_M:
            return lodging
        return lodging.model_copy(update={"place_id": best.place_id, "lat": best.lat, "lng": best.lng})

    return list(await asyncio.gather(*(locate(lodging) for lodging in lodgings)))


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
    lodging = lodging_input_for_night(night, lodgings)
    return lodging.name if lodging else None


def lodging_input_for_night(night: date, lodgings: list[LodgingInput]) -> LodgingInput | None:
    for lodging in lodgings:
        if lodging.check_in <= night < lodging.check_out:
            return lodging
    return None
