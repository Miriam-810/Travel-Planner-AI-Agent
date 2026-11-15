"""get_weather: daily weather for one place and date, from Open-Meteo (free, no key).

- Dates within the forecast window (today .. today+15) use the forecast API.
- Later dates use the average of the same calendar window (date ±3 days) over
  the past 5 years from the historical archive API, labelled "climate_avg".

Results are cached in memory. A forecast entry is keyed by today's date too, so
it refreshes daily; a climate average never changes, so it is cached as is.
"""

import asyncio
from collections import Counter
from datetime import date, datetime, timedelta
from statistics import mean
from zoneinfo import ZoneInfo

import httpx2

from app.models import Weather

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_FIELDS = "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code"

FORECAST_DAYS = 16  # Open-Meteo forecasts up to 16 days, today included
CLIMATE_YEARS = 5
CLIMATE_WINDOW_DAYS = 3  # ± days around the target date
TIMEOUT_S = 10.0
CACHE_MAX_ENTRIES = 2000
JST = ZoneInfo("Asia/Tokyo")


class WeatherError(Exception):
    """Open-Meteo could not provide weather for this place and date."""


# WMO weather interpretation codes → short Chinese summary.
def summarize_code(code: int) -> str:
    if code == 0:
        return "晴"
    if code in (1, 2):
        return "晴時多雲"
    if code == 3:
        return "陰"
    if code in (45, 48):
        return "霧"
    if 51 <= code <= 57:
        return "毛毛雨"
    if 61 <= code <= 67:
        return "雨"
    if 71 <= code <= 77:
        return "雪"
    if 80 <= code <= 82:
        return "陣雨"
    if code in (85, 86):
        return "陣雪"
    if 95 <= code <= 99:
        return "雷雨"
    return "—"


def today_in_japan() -> date:
    return datetime.now(JST).date()


def in_forecast_window(day: date, today: date) -> bool:
    return 0 <= (day - today).days < FORECAST_DAYS


_cache: dict[tuple, Weather] = {}


def clear_cache() -> None:
    _cache.clear()


async def get_weather(
    lat: float,
    lng: float,
    day: date,
    *,
    client: httpx2.AsyncClient,
    today: date | None = None,
    tz: ZoneInfo = JST,
) -> Weather:
    """`tz` is the destination's timezone: it decides what "today" and each date mean."""
    today = today or datetime.now(tz).date()
    place = (round(lat, 2), round(lng, 2))

    if in_forecast_window(day, today):
        key = ("forecast", *place, day, today)
        if key not in _cache:
            _cache[key] = await _forecast(client, lat, lng, day, tz)
    else:
        key = ("climate_avg", *place, day.month, day.day)
        if key not in _cache:
            _cache[key] = await _climate_avg(client, lat, lng, day, today, tz)
    result = _cache[key]
    while len(_cache) > CACHE_MAX_ENTRIES:  # oldest first; lat/lng come from clients
        del _cache[next(iter(_cache))]
    return result


async def _fetch_daily(
    client: httpx2.AsyncClient, url: str, lat: float, lng: float, start: date, end: date, tz: ZoneInfo
) -> dict:
    params = {
        "latitude": lat,
        "longitude": lng,
        "daily": DAILY_FIELDS,
        "timezone": tz.key,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    try:
        res = await client.get(url, params=params, timeout=TIMEOUT_S)
        res.raise_for_status()
        daily = res.json()["daily"]
    except (httpx2.HTTPError, KeyError, ValueError) as exc:
        raise WeatherError(f"Open-Meteo request failed: {type(exc).__name__} {exc}".rstrip()) from exc
    return daily


def _values(daily: dict, field: str) -> list:
    return [v for v in daily.get(field, []) if v is not None]


async def _forecast(client: httpx2.AsyncClient, lat: float, lng: float, day: date, tz: ZoneInfo) -> Weather:
    daily = await _fetch_daily(client, FORECAST_URL, lat, lng, day, day, tz)
    highs, lows = _values(daily, "temperature_2m_max"), _values(daily, "temperature_2m_min")
    if not highs or not lows:
        raise WeatherError(f"no forecast for {day}")
    codes = _values(daily, "weather_code")
    precip = _values(daily, "precipitation_sum")
    return Weather(
        source="forecast",
        high_c=round(highs[0], 1),
        low_c=round(lows[0], 1),
        precip_mm=round(precip[0], 1) if precip else None,
        summary=summarize_code(int(codes[0])) if codes else "—",
    )


def _same_day_in(year: int, day: date) -> date:
    # Feb 29 → Feb 28 in non-leap years.
    try:
        return day.replace(year=year)
    except ValueError:
        return day.replace(year=year, day=28)


async def _climate_avg(
    client: httpx2.AsyncClient, lat: float, lng: float, day: date, today: date, tz: ZoneInfo
) -> Weather:
    # Most recent CLIMATE_YEARS years whose whole window is already in the archive.
    years: list[int] = []
    year = day.year - 1
    while len(years) < CLIMATE_YEARS:
        if _same_day_in(year, day) + timedelta(days=CLIMATE_WINDOW_DAYS) < today - timedelta(days=7):
            years.append(year)
        year -= 1

    window = timedelta(days=CLIMATE_WINDOW_DAYS)
    results = await asyncio.gather(
        *(
            _fetch_daily(client, ARCHIVE_URL, lat, lng, _same_day_in(y, day) - window, _same_day_in(y, day) + window, tz)
            for y in years
        )
    )

    highs = [v for d in results for v in _values(d, "temperature_2m_max")]
    lows = [v for d in results for v in _values(d, "temperature_2m_min")]
    precip = [v for d in results for v in _values(d, "precipitation_sum")]
    codes = [int(v) for d in results for v in _values(d, "weather_code")]
    if not highs or not lows:
        raise WeatherError(f"no historical data around {day}")

    # Most common kind of weather across the window, e.g. "雪".
    summary = Counter(summarize_code(c) for c in codes).most_common(1)[0][0] if codes else "—"
    return Weather(
        source="climate_avg",
        high_c=round(mean(highs), 1),
        low_c=round(mean(lows), 1),
        precip_mm=round(mean(precip), 1) if precip else None,
        summary=summary,
    )
