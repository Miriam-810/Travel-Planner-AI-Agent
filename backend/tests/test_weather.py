import json
from datetime import date, timedelta

import httpx2
import pytest

from app.tools.weather import ARCHIVE_URL, FORECAST_URL, WeatherError, get_weather, summarize_code
from tests.conftest import FakeOpenMeteo, daily_payload

pytestmark = pytest.mark.anyio

TODAY = date(2026, 11, 15)
AOMORI = (40.82, 140.74)


def url_of(req: httpx2.Request) -> str:
    return str(req.url).split("?")[0]


async def test_date_within_16_days_uses_forecast():
    fake = FakeOpenMeteo(lambda r: httpx2.Response(200, text=json.dumps(daily_payload(
        date.fromisoformat(r.url.params["start_date"]), date.fromisoformat(r.url.params["end_date"]),
        high=8.4, low=1.2, precip=0.0, code=3,
    ))))
    async with fake.client() as client:
        w = await get_weather(*AOMORI, TODAY + timedelta(days=15), client=client, today=TODAY)

    assert w.source == "forecast"
    assert (w.high_c, w.low_c, w.precip_mm, w.summary) == (8.4, 1.2, 0.0, "陰")
    assert [url_of(r) for r in fake.requests] == [FORECAST_URL]


async def test_date_after_16_days_uses_five_year_average():
    fake = FakeOpenMeteo()
    async with fake.client() as client:
        w = await get_weather(*AOMORI, date(2026, 12, 25), client=client, today=TODAY)

    assert w.source == "climate_avg"
    assert (w.high_c, w.low_c, w.summary) == (3.0, -3.0, "雪")
    assert all(url_of(r) == ARCHIVE_URL for r in fake.requests)
    windows = sorted((r.url.params["start_date"], r.url.params["end_date"]) for r in fake.requests)
    assert windows == [(f"{y}-12-22", f"{y}-12-28") for y in range(2021, 2026)]


async def test_climate_average_skips_years_not_yet_in_archive():
    # Target 2027-11-12: last year's window (2026-11-09..15) is too recent for the archive.
    fake = FakeOpenMeteo()
    async with fake.client() as client:
        await get_weather(*AOMORI, date(2027, 11, 12), client=client, today=TODAY)

    years = sorted(int(r.url.params["start_date"][:4]) for r in fake.requests)
    assert years == [2021, 2022, 2023, 2024, 2025]


async def test_feb_29_maps_to_feb_28_in_non_leap_years():
    fake = FakeOpenMeteo()
    async with fake.client() as client:
        w = await get_weather(*AOMORI, date(2028, 2, 29), client=client, today=TODAY)

    assert w.source == "climate_avg"
    starts = {r.url.params["start_date"] for r in fake.requests}
    assert "2026-02-25" in starts  # non-leap: Feb 28 minus 3 days
    assert "2024-02-26" in starts  # leap year keeps Feb 29, minus 3 days


async def test_results_are_cached():
    fake = FakeOpenMeteo()
    async with fake.client() as client:
        first = await get_weather(*AOMORI, date(2026, 12, 25), client=client, today=TODAY)
        n = len(fake.requests)
        second = await get_weather(40.8201, 140.7399, date(2026, 12, 25), client=client, today=TODAY)

    assert second == first
    assert len(fake.requests) == n


async def test_http_error_raises_weather_error():
    fake = FakeOpenMeteo(lambda r: httpx2.Response(500, text="boom"))
    async with fake.client() as client:
        with pytest.raises(WeatherError):
            await get_weather(*AOMORI, TODAY + timedelta(days=1), client=client, today=TODAY)


async def test_missing_values_raise_weather_error():
    empty = {"daily": {"time": [], "temperature_2m_max": [], "temperature_2m_min": []}}
    fake = FakeOpenMeteo(lambda r: httpx2.Response(200, text=json.dumps(empty)))
    async with fake.client() as client:
        with pytest.raises(WeatherError):
            await get_weather(*AOMORI, TODAY + timedelta(days=1), client=client, today=TODAY)


@pytest.mark.parametrize(
    ("code", "summary"),
    [(0, "晴"), (2, "晴時多雲"), (3, "陰"), (45, "霧"), (53, "毛毛雨"), (63, "雨"), (73, "雪"), (81, "陣雨"), (85, "陣雪"), (95, "雷雨")],
)
async def test_summarize_code(code, summary):
    assert summarize_code(code) == summary
