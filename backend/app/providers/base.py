"""Provider interfaces: what the agent and the trip builder need from a country.

Everything country-specific lives behind these types:

- `PlaceProvider`  finds places and returns their opening hours (Japan: Google Places).
- `RouteProvider`  travel time between two stops (phase 2; no country has one yet).
- `Country`        timezone, local language for place names, holiday seasons.

The agent loop, the outline checks and the trip builder only talk to these
interfaces. Adding a country (e.g. Korea) means writing its providers in a new
module and registering it in `app/providers/registry.py`; nothing else changes.

Opening hours use one shared format, `periods`, borrowed from Google Places:
a list of {"open": {"day", "hour", "minute"}, "close": {...}} with day 0 =
Sunday; a single period without "close" means open 24 hours. A provider whose
source has another format converts to this one (see app/tools/hours.py).
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal, Protocol
from zoneinfo import ZoneInfo

from app.models import PlaceHours
from app.tools.hours import hours_text, is_open_for_stay

# Many sources (Google's currentOpeningHours) report actual hours, holidays and
# temporary closures included, for this many days ahead. Beyond that only the
# regular weekly hours are known.
ACTUAL_HOURS_DAYS = 7


class PlacesError(Exception):
    """The place provider could not answer."""


class PlaceNotFound(PlacesError):
    pass


class UnsupportedCountry(Exception):
    pass


# --- places ------------------------------------------------------------------


@dataclass(frozen=True)
class Place:
    """One place, in the same shape whichever provider found it."""

    place_id: str
    name: str  # in the country's local language, as on the shop sign
    address: str
    lat: float
    lng: float
    business_status: str  # OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | ...
    maps_url: str | None
    rating: float | None
    rating_count: int | None
    regular_periods: list[dict] | None  # weekly hours; None = the provider has no hours
    current_periods: list[dict] | None = None  # actual hours for the next ACTUAL_HOURS_DAYS days

    def periods_for(self, day: date, today: date) -> list[dict] | None:
        """This week's actual hours when the provider has them, otherwise the regular weekly hours."""
        if self.current_periods and 0 <= (day - today).days < ACTUAL_HOURS_DAYS:
            return self.current_periods
        return self.regular_periods

    def hours_on(self, day: date, arrive: time | None = None, stay_min: int = 0, *, today: date) -> PlaceHours:
        periods = self.periods_for(day, today)
        if not periods:
            text, open_ = None, None  # e.g. a park or viewpoint with no hours
        else:
            text = hours_text(periods, day)
            open_ = is_open_for_stay(periods, day, arrive, stay_min) if arrive else None
        return PlaceHours(
            today_text=text,
            open_at_arrive=open_,
            business_status=self.business_status,
            checked_at=datetime.now(UTC),
        )


class PlaceProvider(Protocol):
    async def search(self, query: str, lat: float, lng: float, *, radius_m: int) -> list[Place]:
        """Up to 3 candidates near a point, best match first."""
        ...

    async def get(self, place_id: str) -> Place:
        """One place by id. Raises PlaceNotFound for unknown or malformed ids."""
        ...


# --- routes (interface only; phase 2) ------------------------------------------

TravelMode = Literal["transit", "walk", "drive"]


@dataclass(frozen=True)
class LatLng:
    lat: float
    lng: float


@dataclass(frozen=True)
class Route:
    mode: TravelMode
    duration_min: int
    distance_m: int
    summary: str  # e.g. "JR 奧羽本線 → 徒步 8 分"


class RouteProvider(Protocol):
    async def route(self, origin: LatLng, destination: LatLng, *, depart_at: datetime, mode: TravelMode) -> Route:
        ...


# --- country ---------------------------------------------------------------------


@dataclass(frozen=True)
class Country:
    code: str  # ISO 3166-1 alpha-2, e.g. "JP"
    name_zh: str  # 日本
    timezone: ZoneInfo
    local_language: str  # for the prompt: stop names are '<中文說明>｜<local name>'
    name_examples: tuple[str, ...]  # e.g. '海鮮丼市場｜青森魚菜センター'
    holiday_season: Callable[[date], str | None]  # periods when shops change hours
    centre: tuple[float, float] = (0.0, 0.0)  # lat, lng to bias country-wide searches (hotels)

    def today(self) -> date:
        return datetime.now(self.timezone).date()

    def hours_caveat(self, day: date, today: date) -> str | None:
        """A holiday season beyond the days providers report actual hours for."""
        if day - today < timedelta(days=ACTUAL_HOURS_DAYS):
            return None
        return self.holiday_season(day)


@dataclass(frozen=True)
class Providers:
    """Everything one country plugs in."""

    country: Country
    places: PlaceProvider
    routes: RouteProvider | None = None  # phase 2


class ProviderRegistry:
    """Country code → providers. Built per request, so providers can share the HTTP client."""

    def __init__(self, factories: dict[str, Callable[[], Providers]]):
        self._factories = factories

    @property
    def codes(self) -> list[str]:
        return sorted(self._factories)

    def get(self, code: str) -> Providers:
        try:
            return self._factories[code]()
        except KeyError:
            raise UnsupportedCountry(code) from None
