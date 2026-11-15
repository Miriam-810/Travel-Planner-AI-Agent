import json
from collections.abc import Callable
from datetime import date, timedelta

import httpx2
import pytest

from app.tools import weather


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _clear_weather_cache():
    weather.clear_cache()
    yield
    weather.clear_cache()


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
