"""The provider architecture: a new country plugs in without changing the agent."""

from datetime import date
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.agent.loop import run_agent
from app.agent.prompts import first_message, system_prompt
from app.main import app, get_http_client, get_limiter, get_registry
from app.providers.base import Country, ProviderRegistry, Providers, UnsupportedCountry
from app.providers.japan import JAPAN
from app.trip_builder import build_trip
from tests.agent_fixtures import REQUEST, TODAY, FakeLLM, FakePlaceProvider, fake_weather, response, tool_use, valid_outline
from tests.conftest import INVITE, FakeOpenMeteo, make_limiter, sample_registry
from tests.test_trips_endpoint import REQUEST as SAMPLE_REQUEST
from tests.test_trips_endpoint import outline_from_sample

# A pretend second country, built only from the public interfaces.
KOREA = Country(
    code="KR",
    name_zh="韓國",
    timezone=ZoneInfo("Asia/Seoul"),
    local_language="Korean",
    name_examples=("烤肉店｜마포갈매기",),
    holiday_season=lambda d: "春節" if (d.month, d.day) == (2, 17) else None,
)


def korea() -> Providers:
    return Providers(country=KOREA, places=FakePlaceProvider())


def test_prompt_is_built_from_the_country():
    prompt = system_prompt(KOREA)
    assert "韓國 (KR)" in prompt and "Korean name" in prompt and "마포갈매기" in prompt
    assert "Japan" not in prompt and "日本" not in prompt
    assert '"country": "KR"' in first_message(REQUEST.model_copy(update={"country": "KR"}), KOREA, today=TODAY)


def test_japan_prompt_keeps_japanese_names():
    prompt = system_prompt(JAPAN)
    assert "日本 (JP)" in prompt and "青森魚菜センター" in prompt


@pytest.mark.anyio
async def test_agent_runs_unchanged_with_another_country():
    searches = [
        tool_use("search_place", {"query": q, "lat": 37.5, "lng": 127.0, "radius_m": 1000, "date": "2026-12-08"}, q)
        for q in ("lunch", "dinner", "museum", "park", "shop")
    ]
    llm = FakeLLM([response(*searches), response(tool_use("submit_outline", valid_outline(), "sub"))])
    request = REQUEST.model_copy(update={"country": "KR"})

    result = await run_agent(
        request, llm=llm, model="claude-haiku-5-5", effort="medium", providers=korea(), weather=fake_weather, today=TODAY
    )

    assert "韓國" in llm.calls[0]["system"]
    assert result.warnings == [] and result.stats.searches == 5


@pytest.mark.anyio
async def test_trip_builder_uses_the_country_timezone_and_holidays():
    fake = FakeOpenMeteo()
    outline = valid_outline()
    async with fake.client() as client:
        from app.models import TripOutline

        trip = await build_trip(
            REQUEST.model_copy(update={"country": "KR"}),
            TripOutline.model_validate(outline),
            client=client,
            providers=korea(),
            today=date(2026, 11, 15),
        )

    assert trip.country == "KR"
    assert {r.url.params["timezone"] for r in fake.requests} == {"Asia/Seoul"}


def test_registry_rejects_unknown_countries():
    registry = ProviderRegistry({"JP": lambda: Providers(country=JAPAN, places=FakePlaceProvider())})
    assert registry.codes == ["JP"]
    with pytest.raises(UnsupportedCountry):
        registry.get("KR")


def test_unsupported_country_is_422(tmp_path):
    app.dependency_overrides[get_http_client] = lambda: FakeOpenMeteo().client()
    app.dependency_overrides[get_registry] = sample_registry
    app.dependency_overrides[get_limiter] = lambda: make_limiter(tmp_path)
    try:
        body = {"request": {**SAMPLE_REQUEST, "country": "KR"}, "outline": outline_from_sample()}
        res = TestClient(app, headers=INVITE).post("/api/trips", json=body)
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 422 and "JP" in res.json()["detail"]


def test_trip_defaults_to_japan(tmp_path):
    app.dependency_overrides[get_http_client] = lambda: FakeOpenMeteo().client()
    app.dependency_overrides[get_registry] = sample_registry
    app.dependency_overrides[get_limiter] = lambda: make_limiter(tmp_path)
    try:
        res = TestClient(app, headers=INVITE).post("/api/trips", json={"request": SAMPLE_REQUEST, "outline": outline_from_sample()})
    finally:
        app.dependency_overrides.clear()
    assert res.json()["country"] == "JP"


@pytest.mark.parametrize("code", ["jp", "JPN", "", "J1"])
def test_country_code_format(code):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        REQUEST.model_validate({**REQUEST.model_dump(mode="json"), "country": code})
