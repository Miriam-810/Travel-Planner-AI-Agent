"""Tool definitions Claude sees, and how their results are shaped for it.

All three tools use `strict: true`, so Claude's inputs always match the schema.
Strict schemas can't express number ranges or string lengths, so those limits
are enforced in code (clamping, or the Pydantic models in app.models).
"""

import json
from datetime import date
from typing import get_args

from app.models import SceneKind, Weather
from app.providers.base import Place

TIME_PATTERN = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"

GET_WEATHER = {
    "name": "get_weather",
    "description": (
        "Daily weather for one place and date. Dates within 16 days return a forecast; "
        "later dates return the average of the same week over the past 5 years (source 'climate_avg'). "
        "Use it to put indoor sights on snowy or rainy days."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "lat": {"type": "number", "description": "Latitude of the day's main area"},
            "lng": {"type": "number", "description": "Longitude of the day's main area"},
            "date": {"type": "string", "format": "date", "description": "YYYY-MM-DD"},
        },
        "required": ["lat", "lng", "date"],
        "additionalProperties": False,
    },
}

SEARCH_PLACE = {
    "name": "search_place",
    "description": (
        "Search places near a point. Returns up to 3 candidates with place_id, name (in the local language), address, "
        "coordinates, rating, business_status and the opening hours on the given date "
        "('休息' = closed that day, null = Google has no hours, common for parks and viewpoints). "
        "Every stop in the outline must use a place_id returned by this tool. Each call costs money: "
        "write specific queries (area + what you want, e.g. '函館 朝市 海鮮丼') and search once per stop."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What to look for, in the local language or Chinese, including the area name"},
            "lat": {"type": "number"},
            "lng": {"type": "number"},
            "radius_m": {"type": "integer", "description": "Search bias radius in metres, 500–20000"},
            "date": {"type": "string", "format": "date", "description": "Planned visit date, YYYY-MM-DD"},
        },
        "required": ["query", "lat", "lng", "radius_m", "date"],
        "additionalProperties": False,
    },
}

_STOP = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "'<short Traditional Chinese description>｜<local name exactly as search_place returned it>'"},
        "kind": {"type": "string", "enum": ["sight", "meal", "shop"]},
        "scene": {
            "type": "string",
            "enum": list(get_args(SceneKind)),
            "description": (
                "Which little scene draws this stop on the trip island: ramen (any noodle shop), seafood (sushi, "
                "kaisen-don, izakaya), cafe (coffee, sweets), restaurant (other meals), shrine, temple, castle, "
                "onsen, museum (also galleries, visitor centres), park (gardens), nature (gorge, waterfall, "
                "mountain, lake), viewpoint (tower, ropeway, night view), beach (also ports), street (old streets, "
                "slopes, warehouses), market, shop (malls, stores), station (also airports), landmark (anything else)"
            ),
        },
        "meal": {
            "anyOf": [{"type": "string", "enum": ["lunch", "dinner"]}, {"type": "null"}],
            "description": "'lunch' or 'dinner' for meal stops, null otherwise",
        },
        "place_id": {"type": "string", "description": "From a search_place result"},
        "arrive": {"type": "string", "pattern": TIME_PATTERN, "description": "Arrival time HH:MM, 24-hour"},
        "stay_min": {"type": "integer", "description": "Minutes spent at the stop, 15–480"},
        "note": {"type": "string", "description": "One short sentence in Traditional Chinese (under 100 characters): why go, or what to order"},
    },
    "required": ["name", "kind", "scene", "meal", "place_id", "arrive", "stay_min", "note"],
    "additionalProperties": False,
}

SUBMIT_OUTLINE = {
    "name": "submit_outline",
    "description": (
        "Submit the finished day-by-day outline. The program checks dates, meals, timing, flights and "
        "opening hours; if anything fails you get the list of problems back: fix only those and submit again."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "theme": {
                "type": "string",
                "enum": ["sage", "snow", "maple", "sakura", "ocean", "summer", "city"],
                "description": (
                    "Colour palette for the trip page, matching the destination and season: "
                    "snow = red and white for snowy winter places (e.g. Aomori in December); "
                    "maple = autumn leaves (e.g. Kyoto in November); sakura = cherry-blossom pink for spring; "
                    "ocean = sea blue for islands and beaches (e.g. Miyakojima, Okinawa); "
                    "summer = fresh green for summer mountains and countryside; "
                    "city = evening blue for big cities (e.g. Tokyo, Osaka); sage = calm default when nothing fits."
                ),
            },
            "days": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string", "format": "date"},
                        "title": {"type": "string", "description": "Short day title in Traditional Chinese, e.g. '函館 → 青森'"},
                        "area": {"type": "string", "description": "Main area of the day"},
                        "area_lat": {"type": "number"},
                        "area_lng": {"type": "number"},
                        "stops": {"type": "array", "items": _STOP},
                    },
                    "required": ["date", "title", "area", "area_lat", "area_lng", "stops"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["theme", "days"],
        "additionalProperties": False,
    },
}

TOOLS = [GET_WEATHER, SEARCH_PLACE, SUBMIT_OUTLINE]


def clamp_radius(radius_m: int) -> int:
    return min(max(int(radius_m), 500), 20000)


def weather_result(w: Weather) -> str:
    return json.dumps(w.model_dump(), ensure_ascii=False)


def search_result(places: list[Place], day: date, *, today: date) -> str:
    """Compact candidates: only the planned date's hours, to keep Claude's input small."""
    out = []
    for p in places:
        hours = p.hours_on(day, today=today)
        out.append({
            "place_id": p.place_id,
            "name": p.name,
            "address": p.address,
            "lat": round(p.lat, 5),
            "lng": round(p.lng, 5),
            "rating": p.rating,
            "rating_count": p.rating_count,
            "business_status": p.business_status,
            "hours_on_date": hours.today_text,
        })
    if not out:
        return "No results. Try a broader query or a larger radius."
    return json.dumps(out, ensure_ascii=False)
