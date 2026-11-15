"""Shared fakes for the agent tests: places, a valid outline, a scripted Claude."""

from datetime import date, time
from types import SimpleNamespace

from app.models import TripRequest
from app.providers.base import Place, Providers
from app.providers.japan import JAPAN

TODAY = date(2026, 11, 15)

REQUEST = TripRequest(
    destination="青森",
    start_date=date(2026, 12, 7),  # Monday
    end_date=date(2026, 12, 11),  # Friday
    arrival_time=time(10, 0),
    departure_time=time(18, 0),
    travelers=2,
)


def daily(open_h, close_h, days=range(7)):
    return [{"open": {"day": d, "hour": open_h, "minute": 0}, "close": {"day": d, "hour": close_h, "minute": 0}} for d in days]


def place(pid, periods=None, status="OPERATIONAL") -> Place:
    return Place(
        place_id=pid, name=pid, address="青森", lat=40.82, lng=140.74, business_status=status,
        maps_url=None, rating=4.2, rating_count=100, regular_periods=periods, current_periods=None,
    )  # fmt: skip


PLACES = {
    "lunch": place("lunch", daily(11, 15)),
    "dinner": place("dinner", daily(17, 22)),
    "museum": place("museum", daily(9, 17, days=[0, 2, 3, 4, 5, 6])),  # closed Mondays
    "park": place("park"),  # no hours on Google
    "shop": place("shop", daily(10, 20)),
    "gone": place("gone", daily(9, 17), status="CLOSED_PERMANENTLY"),
}


def stop(place_id, arrive, stay, kind="sight", meal=None):
    return {"name": place_id, "kind": kind, "meal": meal, "place_id": place_id, "arrive": arrive, "stay_min": stay, "note": ""}


def valid_outline() -> dict:
    days = []
    for i in range(5):
        d = date(2026, 12, 7 + i)
        if i == 4:  # departure day, flight 18:00: no dinner, done by 16:00
            stops = [stop("park", "09:30", 90), stop("lunch", "12:00", 60, "meal", "lunch")]
        elif i == 0:  # arrival day, landing 10:00: not a full day, one sight is enough
            stops = [stop("lunch", "11:30", 60, "meal", "lunch"), stop("park", "13:30", 90), stop("dinner", "18:00", 90, "meal", "dinner")]
        else:  # full day: two activities, no gap over 3 hours
            stops = [
                stop("lunch", "11:30", 60, "meal", "lunch"),
                stop("museum", "13:30", 90),
                stop("shop", "15:30", 60, "shop"),
                stop("dinner", "18:00", 90, "meal", "dinner"),
            ]
        days.append({"date": d.isoformat(), "title": "青森", "area": "青森", "area_lat": 40.82, "area_lng": 140.74, "stops": stops})
    return {"days": days}


# --- scripted Claude -----------------------------------------------------------


def tool_use(name, args, id_):
    return SimpleNamespace(type="tool_use", name=name, input=args, id=id_)


def response(*blocks, stop_reason="tool_use", input_tokens=1000, category=None):
    return SimpleNamespace(
        content=list(blocks),
        stop_reason=stop_reason,
        stop_details=SimpleNamespace(category=category) if category else None,
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=500, cache_read_input_tokens=0, cache_creation_input_tokens=0),
    )


class FakeLLM:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls: list[dict] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})
        return self.responses.pop(0)


class FakePlaceProvider:
    """Searching for a place's id finds exactly that place."""

    def __init__(self, error: Exception | None = None):
        self.error = error

    async def search(self, query, lat, lng, *, radius_m):
        if self.error:
            raise self.error
        return [PLACES[query]] if query in PLACES else []

    async def get(self, place_id):
        return PLACES[place_id]


def fake_providers(error: Exception | None = None) -> Providers:
    return Providers(country=JAPAN, places=FakePlaceProvider(error))


async def fake_weather(lat, lng, day):
    from app.models import Weather

    return Weather(source="climate_avg", high_c=2, low_c=-3, precip_mm=5, summary="雪")
