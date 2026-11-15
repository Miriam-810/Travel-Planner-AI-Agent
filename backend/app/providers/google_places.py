"""PlaceProvider backed by Google Places API (New).

- `search` (Text Search): up to 3 candidates near a point.
- `get` (Place Details): one place by id, used when the user confirms an outline.

Both ask for opening hours and rating, which Google bills as the Enterprise
SKU (Text Search $35, Place Details $20 per 1,000; 1,000 free each per month).
Results are cached in memory for a few hours, so the place_ids Claude found
while planning resolve without a second call when the user confirms the
outline. Google's terms allow keeping only place_id long term, so nothing is
written to disk.

The same class can serve any country Google covers; `language` and `region`
come from the country module (Japan: "ja", "JP").
"""

import re
import time as clock

import httpx2

from app.models import PLACE_ID_PATTERN
from app.providers.base import Place, PlaceNotFound, PlacesError

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
CACHE_TTL_S = 3 * 60 * 60
CACHE_MAX_ENTRIES = 5000
TIMEOUT_S = 10.0


def place_from_api(raw: dict) -> Place:
    loc = raw.get("location") or {}
    if "id" not in raw or "latitude" not in loc:
        raise PlacesError(f"unexpected place payload: {sorted(raw)}")
    return Place(
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


# place_id → (stored_at, Place); shared by every GooglePlacesProvider in the process.
_cache: dict[str, tuple[float, Place]] = {}


def clear_cache() -> None:
    _cache.clear()


def _remember(place: Place) -> Place:
    if len(_cache) >= CACHE_MAX_ENTRIES:
        now = clock.monotonic()
        for pid in [k for k, (t, _) in _cache.items() if now - t >= CACHE_TTL_S]:
            del _cache[pid]
        while len(_cache) >= CACHE_MAX_ENTRIES:  # still full: drop the oldest
            del _cache[next(iter(_cache))]
    _cache[place.place_id] = (clock.monotonic(), place)
    return place


def _cached(place_id: str) -> Place | None:
    hit = _cache.get(place_id)
    if hit and clock.monotonic() - hit[0] < CACHE_TTL_S:
        return hit[1]
    return None


class GooglePlacesProvider:
    def __init__(self, client: httpx2.AsyncClient, api_key: str, *, language: str, region: str):
        self.client = client
        self.api_key = api_key
        self.language = language  # names come back in this language, e.g. "ja" → 青森魚菜センター
        self.region = region

    def _headers(self, mask: str) -> dict[str, str]:
        return {"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": mask}

    async def search(self, query: str, lat: float, lng: float, *, radius_m: int = 3000) -> list[Place]:
        body = {
            "textQuery": query,
            "languageCode": self.language,
            "regionCode": self.region,
            "pageSize": MAX_CANDIDATES,
            "locationBias": {
                "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": min(max(radius_m, 1), 50000)}
            },
        }
        data = await _call(self.client.post(SEARCH_URL, json=body, headers=self._headers(SEARCH_MASK), timeout=TIMEOUT_S))
        return [_remember(place_from_api(p)) for p in data.get("places", [])[:MAX_CANDIDATES]]

    async def get(self, place_id: str) -> Place:
        if not re.fullmatch(PLACE_ID_PATTERN, place_id):
            raise PlaceNotFound(place_id)  # never let it reach the URL path
        if cached := _cached(place_id):
            return cached
        url = DETAILS_URL.format(place_id=place_id)
        params = {"languageCode": self.language, "regionCode": self.region}
        data = await _call(
            self.client.get(url, params=params, headers=self._headers(DETAILS_MASK), timeout=TIMEOUT_S),
            place_id=place_id,
        )
        return _remember(place_from_api(data))


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
