"""Japan: Google Places in Japanese, Japanese holiday seasons. Routes come in phase 2."""

from datetime import date
from zoneinfo import ZoneInfo

import httpx2

from app.providers.base import Country, Providers
from app.providers.google_places import GooglePlacesProvider
from app.providers.transitous import TransitousRouteProvider


def holiday_season(day: date) -> str | None:
    """Periods when many Japanese shops change hours: 年末年始, Golden Week, お盆."""
    md = (day.month, day.day)
    if md >= (12, 29) or md <= (1, 3):
        return "年末年始"
    if (4, 29) <= md <= (5, 5):
        return "黃金週"
    if (8, 13) <= md <= (8, 16):
        return "盂蘭盆節"
    return None


JAPAN = Country(
    code="JP",
    name_zh="日本",
    timezone=ZoneInfo("Asia/Tokyo"),
    local_language="Japanese",
    name_examples=("海鮮丼市場｜青森魚菜センター", "繩文遺跡｜三内丸山遺跡", "精釀啤酒餐廳｜浅虫ビール"),
    holiday_season=holiday_season,
    centre=(36.2, 138.2),
)


def japan_providers(client: httpx2.AsyncClient, places_api_key: str) -> Providers:
    # Japanese, so names come back as the shop's own name (e.g. 青森魚菜センター), never a
    # romanised fallback like "Yokochou" when Google has no Chinese name for the place.
    places = GooglePlacesProvider(client, places_api_key, language="ja", region="JP")
    return Providers(country=JAPAN, places=places, routes=TransitousRouteProvider(client))
