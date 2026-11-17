import pytest
from fastapi.testclient import TestClient

from app.main import app, get_limiter, get_registry
from app.models import TripRequest
from app.providers.base import ProviderRegistry, Providers
from app.providers.japan import JAPAN
from tests.agent_fixtures import REQUEST, FakePlaceProvider
from tests.conftest import INVITE, make_limiter


class Recording(FakePlaceProvider):
    def __init__(self):
        super().__init__()
        self.queries = []

    async def search(self, query, lat, lng, *, radius_m):
        self.queries.append((query, lat, lng, radius_m))
        return await super().search(query.split()[0], lat, lng, radius_m=radius_m)


@pytest.fixture
def client(tmp_path):
    places = Recording()
    app.dependency_overrides[get_limiter] = lambda: make_limiter(tmp_path)
    app.dependency_overrides[get_registry] = lambda: ProviderRegistry({"JP": lambda: Providers(country=JAPAN, places=places)})
    yield TestClient(app), places
    app.dependency_overrides.clear()


def test_hotel_search_returns_places_with_location(client):
    c, places = client
    res = c.post("/api/hotels", json={"q": "lunch", "destination": "青森"}, headers=INVITE)
    assert res.status_code == 200, res.text
    [hotel] = res.json()
    assert hotel["place_id"] == "lunch" and hotel["lat"] == pytest.approx(40.82)
    query, lat, lng, radius = places.queries[0]
    assert query == "lunch 青森" and (lat, lng) == JAPAN.centre and radius == 50_000


def test_hotel_search_needs_an_invite_code(client):
    c, _ = client
    assert c.post("/api/hotels", json={"q": "lunch"}).status_code == 401


def test_hotel_search_rejects_one_letter_queries(client):
    c, places = client
    assert c.post("/api/hotels", json={"q": " a "}, headers=INVITE).status_code == 422
    assert places.queries == []


def test_hotel_search_has_its_own_daily_limit(client):
    c, _ = client
    for _ in range(2):
        assert c.post("/api/hotels", json={"q": "lunch"}, headers=INVITE).status_code == 200
    res = c.post("/api/hotels", json={"q": "lunch"}, headers=INVITE)
    assert res.status_code == 429 and "飯店搜尋次數" in res.json()["detail"]


def test_hotel_location_reaches_the_planner():
    from app.agent.prompts import first_message

    req = TripRequest.model_validate({
        **REQUEST.model_dump(mode="json"),
        "lodgings": [{"name": "飯店", "check_in": "2026-12-07", "check_out": "2026-12-09", "place_id": "h1", "lat": 40.83, "lng": 140.73}],
    })
    msg = first_message(req, JAPAN, today=REQUEST.start_date)
    assert '"lat": 40.83' in msg and '"name": "飯店"' in msg


def test_hotel_without_location_is_just_a_name():
    from app.agent.prompts import first_message

    req = TripRequest.model_validate({
        **REQUEST.model_dump(mode="json"),
        "lodgings": [{"name": "民宿", "check_in": "2026-12-07", "check_out": "2026-12-09"}],
    })
    assert '"hotel_tonight": "民宿"' in first_message(req, JAPAN, today=REQUEST.start_date)
