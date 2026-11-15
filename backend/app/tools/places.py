"""Google Places API (New): find places and check their opening hours.

- `search_place` (Text Search) is the agent's tool: up to 3 candidates near a
  point, each with only the planned date's hours, to keep Claude's input small.
- `get_place` (Place Details) looks up one place_id. POST /api/trips uses it to
  fill coordinates and hours for every stop of a confirmed outline.

Both requests ask for opening hours and rating, which Google bills as the
Enterprise SKU (Text Search $35, Place Details $20 per 1,000; 1,000 free each
per month). Results are cached in memory for a few hours, so the place_ids
Claude found while planning resolve without a second call when the user
confirms the outline. Google's terms allow keeping only place_id long term,
so nothing is written to disk.
"""

import time as clock
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import httpx2

from app.models import PlaceHours
from app.tools.hours import hours_text, is_open_for_stay
from app.tools.weather import JST, today_in_japan

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

PLACE_FIELDS = [
    "id",
    "displayName",
    "formattedAddress",
    "location",
    "businessStatus",
    "googleMapsUri",
    "regularOpeningHours",
    "currentOpeningHours",
    "rating",
    "userRatingCount",
]
SEARCH_MASK = ",".join(f"places.{f}" for f in PLACE_FIELDS)
DETAILS_MASK = ",".join(PLACE_FIELDS)

MAX_CANDIDATES = 3
CURRENT_HOURS_DAYS = 7  # currentOpeningHours covers today + 6 days, holidays included
CACHE_TTL_S = 3 * 60 * 60
TIMEOUT_S = 10.0
LANGUAGE = "zh-TW"
REGION = "JP"


class PlacesError(Exception):
    """Google Places could not answer."""


class PlaceNotFound(PlacesError):
    pass


@dataclass(frozen=True)
class Place:
    """The parts of a Places response we use."""

    place_id: str
    name: str
    address: str
    lat: float
    lng: float
    business_status: str
    maps_url: str | None
    rating: float | None
    rating_count: int | None
    regular_periods: list[dict] | None
    current_periods: list[dict] | None

    @classmethod
    def from_api(cls, raw: dict) -> "Place":
        loc = raw.get("location") or {}
        if "id" not in raw or "latitude" not in loc:
            raise PlacesError(f"unexpected place payload: {sorted(raw)}")
        return cls(
            place_id=raw["id"],
            name=(raw.get("displayName") or {}).get("text", ""),
            address=raw.get("formattedAddress", ""),
            lat=loc["latitude"],
            lng=loc["longitude"],
            business_status=raw.get("businessStatus", "BUSINESS_STATUS_UNSPECIFIED"),
            maps_url=raw.get("googleMapsUri"),
            rating=raw.get("rating"),
            rating_count=raw.get("userRatingCount"),
            regular_periods=(raw.get("regularOpeningHours") or {}).get("periods"),
            current_periods=(raw.get("currentOpeningHours") or {}).get("periods"),
        )

    def periods_for(self, day: date, today: date) -> list[dict] | None:
        """Hours that apply on `day`: this week's actual hours (holidays included) when
        Google has them, otherwise the regular weekly hours."""
        if self.current_periods and 0 <= (day - today).days < CURRENT_HOURS_DAYS:
            return self.current_periods
        return self.regular_periods

    def hours_on(self, day: date, arrive: time | None = None, stay_min: int = 0, *, today: date | None = None) -> PlaceHours:
        periods = self.periods_for(day, today or today_in_japan())
        if not periods:
            text, open_ = None, None  # e.g. a park or viewpoint with no hours on Google
        else:
            text = hours_text(periods, day)
            open_ = is_open_for_stay(periods, day, arrive, stay_min) if arrive else None
        return PlaceHours(
            today_text=text,
            open_at_arrive=open_,
            business_status=self.business_status,
            checked_at=datetime.now(JST),
        )


# place_id → (stored_at, Place)
_cache: dict[str, tuple[float, Place]] = {}


def clear_cache() -> None:
    _cache.clear()


def _remember(place: Place) -> Place:
    _cache[place.place_id] = (clock.monotonic(), place)
    return place


def _cached(place_id: str) -> Place | None:
    hit = _cache.get(place_id)
    if hit and clock.monotonic() - hit[0] < CACHE_TTL_S:
        return hit[1]
    return None


def _headers(api_key: str, mask: str) -> dict[str, str]:
    return {"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": mask}


async def search_place(
    query: str,
    lat: float,
    lng: float,
    *,
    radius_m: float = 3000,
    client: httpx2.AsyncClient,
    api_key: str,
) -> list[Place]:
    body = {
        "textQuery": query,
        "languageCode": LANGUAGE,
        "regionCode": REGION,
        "pageSize": MAX_CANDIDATES,
        "locationBias": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": min(max(radius_m, 1), 50000)}
        },
    }
    data = await _call(client.post(SEARCH_URL, json=body, headers=_headers(api_key, SEARCH_MASK), timeout=TIMEOUT_S))
    return [_remember(Place.from_api(p)) for p in data.get("places", [])[:MAX_CANDIDATES]]


async def get_place(place_id: str, *, client: httpx2.AsyncClient, api_key: str) -> Place:
    if cached := _cached(place_id):
        return cached
    url = DETAILS_URL.format(place_id=place_id)
    params = {"languageCode": LANGUAGE, "regionCode": REGION}
    data = await _call(
        client.get(url, params=params, headers=_headers(api_key, DETAILS_MASK), timeout=TIMEOUT_S), place_id=place_id
    )
    return _remember(Place.from_api(data))


async def _call(pending, *, place_id: str | None = None) -> dict:
    try:
        res = await pending
    except httpx2.HTTPError as exc:
        raise PlacesError(f"Places request failed: {type(exc).__name__} {exc}".rstrip()) from exc
    if place_id is not None and res.status_code in (400, 404):
        # Malformed or unknown ids come back as 400 INVALID_ARGUMENT or 404 NOT_FOUND.
        raise PlaceNotFound(place_id)
    if res.is_error:
        raise PlacesError(f"Places HTTP {res.status_code}: {_error_message(res)}")
    try:
        return res.json()
    except ValueError as exc:
        raise PlacesError("Places returned invalid JSON") from exc


def _error_message(res: httpx2.Response) -> str:
    try:
        return res.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return res.text[:200]


def holiday_season(day: date) -> str | None:
    """Japanese periods when many shops change hours: 年末年始, Golden Week, お盆."""
    md = (day.month, day.day)
    if md >= (12, 29) or md <= (1, 3):
        return "年末年始"
    if (4, 29) <= md <= (5, 5):
        return "黃金週"
    if (8, 13) <= md <= (8, 16):
        return "盂蘭盆節"
    return None


def needs_hours_caveat(day: date, today: date) -> str | None:
    """A holiday season beyond the 7 days Google reports actual hours for."""
    if day - today < timedelta(days=CURRENT_HOURS_DAYS):
        return None
    return holiday_season(day)
