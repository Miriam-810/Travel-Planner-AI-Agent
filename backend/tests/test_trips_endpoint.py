from datetime import date

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_http_client, get_limiter, get_registry, load_sample_trip
from app.models import LodgingInput
from app.trip_builder import lodging_for_night
from tests.conftest import INVITE, FakeOpenMeteo, make_limiter, sample_registry


def outline_from_sample() -> dict:
    """The sample trip turned back into what Claude would submit."""
    trip = load_sample_trip()
    draft_fields = {"name", "kind", "meal", "place_id", "arrive", "stay_min", "note"}
    return {
        "days": [
            {
                "date": d.date.isoformat(),
                "title": d.title,
                "area": d.area,
                "area_lat": d.stops[0].lat,
                "area_lng": d.stops[0].lng,
                "stops": [s.model_dump(mode="json", include=draft_fields) for s in d.stops],
            }
            for d in trip.days
        ]
    }


REQUEST = {
    "destination": "青森・函館",
    "start_date": "2026-12-25",
    "end_date": "2027-01-01",
    "travelers": 2,
    "lodgings": [
        {"name": "Daiwa Roynet Hotel Aomori", "check_in": "2026-12-25", "check_out": "2026-12-29"},
        {"name": "Dormy Inn Aomori", "check_in": "2026-12-31", "check_out": "2027-01-01"},
    ],
}


@pytest.fixture
def client_with(request, tmp_path):
    """TestClient whose outbound HTTP goes to a FakeOpenMeteo."""
    fake: FakeOpenMeteo = request.param if hasattr(request, "param") else FakeOpenMeteo()
    http = fake.client()
    app.dependency_overrides[get_http_client] = lambda: http
    # Sample place ids, whether or not a real Places key is in backend/.env.
    app.dependency_overrides[get_registry] = sample_registry
    app.dependency_overrides[get_limiter] = lambda: make_limiter(tmp_path)
    yield TestClient(app, headers=INVITE), fake
    app.dependency_overrides.clear()


def test_build_trip_adds_weather_lodging_and_place_details(client_with):
    client, fake = client_with
    res = client.post("/api/trips", json={"request": REQUEST, "outline": outline_from_sample()})

    assert res.status_code == 200, res.text
    trip = res.json()
    assert trip["destination"] == "青森・函館"
    assert trip["sample"] is False
    assert len(trip["days"]) == 8
    assert fake.requests, "weather should be fetched"

    day1, day5, day7, day8 = trip["days"][0], trip["days"][4], trip["days"][6], trip["days"][7]
    assert day1["weather"]["summary"] == "雪"
    assert day1["lodging"] == "Daiwa Roynet Hotel Aomori"
    assert day5["lodging"] is None  # 12/29–30 not in the request's lodgings
    assert day7["lodging"] == "Dormy Inn Aomori"
    assert day8["lodging"] is None  # departure day

    first_stop = day1["stops"][0]
    assert first_stop["id"] == "d1-s1"
    assert first_stop["lat"] and first_stop["hours"]["business_status"] == "OPERATIONAL"


@pytest.mark.parametrize("client_with", [FakeOpenMeteo(lambda r: httpx2.Response(503))], indirect=True)
def test_weather_failure_leaves_weather_empty(client_with):
    client, _ = client_with
    res = client.post("/api/trips", json={"request": REQUEST, "outline": outline_from_sample()})

    assert res.status_code == 200
    assert all(d["weather"] is None for d in res.json()["days"])


def test_unknown_place_id_is_rejected(client_with):
    client, _ = client_with
    outline = outline_from_sample()
    outline["days"][0]["stops"][0]["place_id"] = "made-up"

    res = client.post("/api/trips", json={"request": REQUEST, "outline": outline})

    assert res.status_code == 422
    assert "made-up" in res.json()["detail"]


def test_lodging_for_night_uses_check_in_inclusive_check_out_exclusive():
    stays = [LodgingInput(name="A", check_in=date(2026, 12, 25), check_out=date(2026, 12, 27))]
    assert lodging_for_night(date(2026, 12, 25), stays) == "A"
    assert lodging_for_night(date(2026, 12, 26), stays) == "A"
    assert lodging_for_night(date(2026, 12, 27), stays) is None
