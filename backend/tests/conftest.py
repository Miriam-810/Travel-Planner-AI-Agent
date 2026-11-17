import json
from collections.abc import Callable
from datetime import date, timedelta

import httpx2
import pytest

from app.limits import UsageLimiter
from app.providers import google_places as places
from app.providers.base import ProviderRegistry, Providers
from app.providers.japan import JAPAN, japan_providers
from app.providers.sample import SamplePlaceProvider
from app.tools import weather

INVITE = {"X-Invite-Code": "test-code"}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _clear_caches():
    weather.clear_cache()
    places.clear_cache()
    yield
    weather.clear_cache()
    places.clear_cache()


def daily_payload(start: date, end: date, *, high=3.0, low=-3.0, precip=5.0, code=71) -> dict:
    """An Open-Meteo style daily response with the same values every day."""
    days = (end - start).days + 1
    return {
        "daily": {
            "time": [(start + timedelta(days=i)).isoformat() for i in range(days)],
            "temperature_2m_max": [high] * days,
            "temperature_2m_min": [low] * days,
            "precipitation_sum": [precip] * days,
            "weather_code": [code] * days,
        }
    }


class FakeOpenMeteo:
    """Records requests and answers like Open-Meteo, without touching the network."""

    def __init__(self, respond: Callable[[httpx2.Request], httpx2.Response] | None = None):
        self.requests: list[httpx2.Request] = []
        self._respond = respond or self.default_response

    @staticmethod
    def default_response(request: httpx2.Request) -> httpx2.Response:
        start = date.fromisoformat(request.url.params["start_date"])
        end = date.fromisoformat(request.url.params["end_date"])
        return httpx2.Response(200, text=json.dumps(daily_payload(start, end)))

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        return self._respond(request)

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self.handler))


def make_limiter(tmp_path, *, per_code=3, per_site=20, trips=(10, 50), revise=(2, 100), hotels=(2, 100)) -> UsageLimiter:
    return UsageLimiter(
        tmp_path / "usage.sqlite",
        {"test-code", "other-code"},
        {"outline": (per_code, per_site), "trips": trips, "revise": revise, "hotels": hotels},
    )


def sample_registry() -> ProviderRegistry:
    """Japan, resolving only the bundled sample trip's places (no Google)."""
    from app.main import load_sample_trip

    return ProviderRegistry({"JP": lambda: Providers(country=JAPAN, places=SamplePlaceProvider(load_sample_trip()))})


def google_registry(http: httpx2.AsyncClient, key: str = "test-key") -> ProviderRegistry:
    """Japan with the real Google provider, talking to whatever `http` is wired to."""
    return ProviderRegistry({"JP": lambda: japan_providers(http, key)})
