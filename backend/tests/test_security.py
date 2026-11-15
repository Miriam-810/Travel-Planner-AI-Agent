"""Limits that stop a client from running up the Google or Anthropic bill."""

import httpx2
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app, get_http_client, get_limiter, get_registry
from app.models import MAX_STOPS_PER_DAY, StopDraft, TripRequest
from app.providers import google_places as places
from app.providers.base import PlaceNotFound
from app.providers.google_places import GooglePlacesProvider
from app.tools import weather
from tests.conftest import INVITE, FakeOpenMeteo, make_limiter, sample_registry
from tests.test_trips_endpoint import REQUEST, outline_from_sample

BASE = {"destination": "青森", "start_date": "2026-12-07", "end_date": "2026-12-11", "travelers": 2}


# --- 2. place_id can't be used to reach other Google endpoints ----------------


@pytest.mark.parametrize("pid", ["../places:searchNearby", "abc/photos/x/media", "x?key=1", "", "a" * 301])
def test_place_id_must_look_like_a_google_id(pid):
    with pytest.raises(ValidationError):
        StopDraft(name="x", kind="sight", place_id=pid, arrive="10:00", stay_min=30)


@pytest.mark.anyio
async def test_get_place_refuses_odd_ids_without_calling_google():
    calls = []
    transport = httpx2.MockTransport(lambda r: calls.append(r) or httpx2.Response(200, json={}))
    async with httpx2.AsyncClient(transport=transport) as client:
        with pytest.raises(PlaceNotFound):
            await GooglePlacesProvider(client, "k", language="ja", region="JP").get("../places:searchNearby")
    assert calls == []


def test_real_looking_ids_are_accepted():
    StopDraft(name="x", kind="sight", place_id="ChIJs6Sn6R6fm18RmYM1-JB9oJ4", arrive="10:00", stay_min=30)


# --- 3. free text has length limits ----------------------------------------------


@pytest.mark.parametrize(
    "extra",
    [
        {"destination": "青" * 51},
        {"budget_twd": 1_000_001},
        {"preferences": ["溫泉"] * 11},
        {"preferences": ["好" * 51]},
        {"lodgings": [{"name": "H", "check_in": "2026-12-07", "check_out": "2026-12-08"}] * 11},
        {"lodgings": [{"name": "H" * 101, "check_in": "2026-12-07", "check_out": "2026-12-08"}]},
    ],
)
def test_request_text_is_bounded(extra):
    with pytest.raises(ValidationError):
        TripRequest.model_validate({**BASE, **extra})


def test_preferences_are_trimmed():
    assert TripRequest.model_validate({**BASE, "preferences": ["  溫泉 "]}).preferences == ["溫泉"]


# --- 1. POST /api/trips can't be used to fire unlimited Places lookups -----------


@pytest.fixture
def trips_client(tmp_path):
    def make(trips=(10, 50)):
        app.dependency_overrides[get_http_client] = lambda: FakeOpenMeteo().client()
        app.dependency_overrides[get_registry] = sample_registry
        app.dependency_overrides[get_limiter] = lambda: make_limiter(tmp_path, trips=trips)
        return TestClient(app, headers=INVITE)

    yield make
    app.dependency_overrides.clear()


def test_outline_dates_must_match_the_request(trips_client):
    outline = outline_from_sample()
    outline["days"] = outline["days"][:5]  # request is 8 days
    res = trips_client().post("/api/trips", json={"request": REQUEST, "outline": outline})
    assert res.status_code == 422 and "dates" in res.json()["detail"]


def test_too_many_stops_in_a_day(trips_client):
    outline = outline_from_sample()
    outline["days"][0]["stops"] = outline["days"][0]["stops"][:1] * (MAX_STOPS_PER_DAY + 1)
    res = trips_client().post("/api/trips", json={"request": REQUEST, "outline": outline})
    assert res.status_code == 422


def test_trips_have_their_own_daily_limit(trips_client):
    client = trips_client(trips=(2, 50))
    body = {"request": REQUEST, "outline": outline_from_sample()}
    assert [client.post("/api/trips", json=body).status_code for _ in range(3)] == [200, 200, 429]


def test_failed_trip_builds_are_not_counted(trips_client):
    client = trips_client(trips=(1, 50))
    bad = outline_from_sample()
    bad["days"][0]["stops"][0]["place_id"] = "made-up"
    assert client.post("/api/trips", json={"request": REQUEST, "outline": bad}).status_code == 422
    assert client.post("/api/trips", json={"request": REQUEST, "outline": outline_from_sample()}).status_code == 200


# --- 6. caches don't grow forever -------------------------------------------------


@pytest.mark.anyio
async def test_weather_cache_is_bounded(monkeypatch):
    from datetime import date

    monkeypatch.setattr(weather, "CACHE_MAX_ENTRIES", 3)
    async with FakeOpenMeteo().client() as client:
        for i in range(6):
            await weather.get_weather(40 + i, 140, date(2026, 11, 16), client=client, today=date(2026, 11, 15))
    assert len(weather._cache) == 3


def test_places_cache_is_bounded(monkeypatch):
    from tests.agent_fixtures import place

    monkeypatch.setattr(places, "CACHE_MAX_ENTRIES", 3)
    for i in range(6):
        places._remember(place(f"p{i}"))
    assert list(places._cache) == ["p3", "p4", "p5"]
