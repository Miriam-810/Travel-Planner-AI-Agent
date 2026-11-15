import json
from datetime import date, time

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_http_client, get_limiter, get_registry
from app.providers.base import PlaceNotFound, PlacesError
from app.providers.google_places import SEARCH_URL, GooglePlacesProvider
from app.providers.japan import JAPAN
from tests.conftest import google_registry
from tests.conftest import INVITE, make_limiter

pytestmark = pytest.mark.anyio

TODAY = date(2026, 11, 15)  # Sunday
KEY = "test-key"


def raw_place(pid="ChIJ-ramen", name="麵屋 示例", periods=None, current=None, status="OPERATIONAL"):
    raw = {
        "id": pid,
        "displayName": {"text": name, "languageCode": "zh-TW"},
        "formattedAddress": "青森縣青森市",
        "location": {"latitude": 40.82, "longitude": 140.74},
        "businessStatus": status,
        "googleMapsUri": f"https://maps.google.com/?cid={pid}",
        "rating": 4.3,
        "userRatingCount": 812,
    }
    if periods is not None:
        raw["regularOpeningHours"] = {"periods": periods}
    if current is not None:
        raw["currentOpeningHours"] = {"periods": current}
    return raw


def daily(open_, close, days=range(7)):
    return [
        {"open": {"day": d, "hour": open_, "minute": 0}, "close": {"day": d, "hour": close, "minute": 0}} for d in days
    ]


def google(client) -> GooglePlacesProvider:
    return GooglePlacesProvider(client, KEY, language="ja", region="JP")


class FakePlaces:
    def __init__(self, places: dict[str, dict], status: int = 200):
        self.places = places
        self.status = status
        self.requests: list[httpx2.Request] = []

    def handler(self, req: httpx2.Request) -> httpx2.Response:
        self.requests.append(req)
        if self.status != 200:
            return httpx2.Response(self.status, json={"error": {"message": "quota exceeded"}})
        if str(req.url).startswith(SEARCH_URL):
            return httpx2.Response(200, json={"places": list(self.places.values())})
        pid = req.url.path.rsplit("/", 1)[-1]
        if pid not in self.places:
            return httpx2.Response(404, json={"error": {"message": "not found"}})
        return httpx2.Response(200, json=self.places[pid])

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self.handler))


async def test_search_sends_key_field_mask_and_location_bias():
    fake = FakePlaces({f"p{i}": raw_place(f"p{i}") for i in range(5)})
    async with fake.client() as client:
        found = await google(client).search("拉麵", 40.82, 140.74, radius_m=2000)

    assert [p.place_id for p in found] == ["p0", "p1", "p2"]  # at most 3 candidates
    req = fake.requests[0]
    assert req.headers["X-Goog-Api-Key"] == KEY
    assert "places.regularOpeningHours" in req.headers["X-Goog-FieldMask"]
    body = json.loads(req.content)
    assert body["textQuery"] == "拉麵" and body["languageCode"] == "ja" and body["pageSize"] == 3
    assert body["locationBias"]["circle"]["radius"] == 2000


async def test_search_results_are_reused_by_details():
    fake = FakePlaces({"p0": raw_place("p0")})
    async with fake.client() as client:
        await google(client).search("拉麵", 40.82, 140.74, radius_m=3000)
        place = await google(client).get("p0")

    assert place.name == "麵屋 示例"
    assert len(fake.requests) == 1


async def test_unknown_place_id_raises_not_found():
    fake = FakePlaces({})
    async with fake.client() as client:
        with pytest.raises(PlaceNotFound):
            await google(client).get("nope")


async def test_server_error_raises_places_error():
    fake = FakePlaces({}, status=429)
    async with fake.client() as client:
        with pytest.raises(PlacesError, match="quota exceeded"):
            await google(client).get("p0")


async def test_hours_use_this_weeks_actual_hours_when_available():
    # Regular 11–21 every day, but closed this Tuesday (a holiday): current hours skip day 2.
    current = daily(11, 21, days=[0, 1, 3, 4, 5, 6])
    fake = FakePlaces({"p0": raw_place("p0", periods=daily(11, 21), current=current)})
    async with fake.client() as client:
        place = await google(client).get("p0")

    this_tue, next_month_tue = date(2026, 11, 17), date(2026, 12, 15)
    closed = place.hours_on(this_tue, time(12, 0), 60, today=TODAY)
    usual = place.hours_on(next_month_tue, time(12, 0), 60, today=TODAY)
    assert (closed.today_text, closed.open_at_arrive) == ("休息", False)
    assert (usual.today_text, usual.open_at_arrive) == ("11:00–21:00", True)


async def test_place_without_hours_is_unknown_not_closed():
    fake = FakePlaces({"park": raw_place("park", name="公園")})
    async with fake.client() as client:
        place = await google(client).get("park")

    hours = place.hours_on(date(2026, 12, 25), time(10, 0), 60, today=TODAY)
    assert hours.today_text is None and hours.open_at_arrive is None
    assert hours.business_status == "OPERATIONAL"


def test_hours_caveat_only_for_holiday_seasons_beyond_a_week():
    assert JAPAN.hours_caveat(date(2026, 12, 31), TODAY) == "年末年始"
    assert JAPAN.hours_caveat(date(2027, 5, 3), TODAY) == "黃金週"
    assert JAPAN.hours_caveat(date(2026, 12, 10), TODAY) is None
    assert JAPAN.hours_caveat(date(2026, 12, 30), date(2026, 12, 28)) is None  # Google has actual hours


# --- POST /api/trips with the Google resolver -------------------------------

STOPS = {
    "lunch": raw_place("lunch", name="午餐店", periods=daily(11, 15)),
    "dinner": raw_place("dinner", name="晚餐店", periods=daily(17, 22)),
    "gone": raw_place("gone", name="老店", periods=daily(10, 20), status="CLOSED_PERMANENTLY"),
}


def outline(dinner_at="18:30"):
    days = []
    for i in range(5):
        d = date(2026, 12, 7 + i).isoformat()  # Mon–Fri, not a holiday season
        days.append({
            "date": d, "title": "青森市區", "area": "青森", "area_lat": 40.82, "area_lng": 140.74,
            "stops": [
                {"name": "午餐店", "kind": "meal", "meal": "lunch", "place_id": "lunch", "arrive": "12:00", "stay_min": 60},
                {"name": "晚餐店", "kind": "meal", "meal": "dinner", "place_id": "dinner", "arrive": dinner_at, "stay_min": 90},
            ],
        })
    return {"days": days}


REQUEST = {"destination": "青森", "start_date": "2026-12-07", "end_date": "2026-12-11", "travelers": 2}


@pytest.fixture
def google_client(tmp_path):
    fake = FakePlaces(STOPS)
    places_http = fake.client()
    weather_down = httpx2.AsyncClient(transport=httpx2.MockTransport(lambda r: httpx2.Response(503)))
    app.dependency_overrides[get_http_client] = lambda: weather_down
    app.dependency_overrides[get_registry] = lambda: google_registry(places_http, KEY)
    app.dependency_overrides[get_limiter] = lambda: make_limiter(tmp_path)
    yield TestClient(app, headers=INVITE), fake
    app.dependency_overrides.clear()


def test_trip_gets_coordinates_and_hours_from_places(google_client):
    client, fake = google_client
    res = client.post("/api/trips", json={"request": REQUEST, "outline": outline()})

    assert res.status_code == 200, res.text
    day = res.json()["days"][0]
    lunch = day["stops"][0]
    assert lunch["lat"] == 40.82 and lunch["maps_url"].endswith("cid=lunch")
    assert lunch["hours"]["today_text"] == "11:00–15:00" and lunch["hours"]["open_at_arrive"] is True
    assert day["warnings"] == []
    assert len(fake.requests) == 2  # one Details call per distinct place, then cached


def test_closed_on_arrival_becomes_a_warning(google_client):
    client, _ = google_client
    res = client.post("/api/trips", json={"request": REQUEST, "outline": outline(dinner_at="21:00")})

    day = res.json()["days"][0]
    assert day["stops"][1]["hours"]["open_at_arrive"] is False
    assert day["warnings"] == ["晚餐店：21:00 抵達、停留 90 分鐘，可能遇到沒營業的時段（當天 17:00–22:00）"]


def test_closed_permanently_becomes_a_warning(google_client):
    client, _ = google_client
    body = outline()
    body["days"][0]["stops"][0]["place_id"] = "gone"
    res = client.post("/api/trips", json={"request": REQUEST, "outline": body})

    assert "午餐店：地圖資料顯示已歇業" in res.json()["days"][0]["warnings"]


def test_unknown_place_is_422(google_client):
    client, _ = google_client
    body = outline()
    body["days"][2]["stops"][0]["place_id"] = "made-up"
    res = client.post("/api/trips", json={"request": REQUEST, "outline": body})

    assert res.status_code == 422 and "made-up" in res.json()["detail"]
