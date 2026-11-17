"""Public transport routes from Transitous (https://transitous.org).

Transitous is a free, community-run router (MOTIS) over open GTFS timetables.
In Japan it covers JR East, the shinkansen, city subways and more, though not
every operator (Hakodate's trams, for one). It is run on donations: keep the
load light (few parallel requests, results cached by the caller) and credit it
on the page.
"""

import asyncio
import re
from datetime import datetime
from typing import Any

import httpx2

from app.models import Leg, LegStep, StepMode
from app.providers.base import LatLng, RoutesError

PLAN_URL = "https://api.transitous.org/api/v1/plan"
# A plain client name: no personal or project details go to outside services.
USER_AGENT = "travel-planner/0.1"
MAX_PARALLEL = 3

MODES: dict[str, StepMode] = {
    "HIGHSPEED_RAIL": "shinkansen",
    "LONG_DISTANCE": "train",
    "NIGHT_RAIL": "train",
    "REGIONAL_FAST_RAIL": "train",
    "REGIONAL_RAIL": "train",
    "RAIL": "train",
    "SUBURBAN": "train",
    "SUBWAY": "subway",
    "METRO": "subway",
    "TRAM": "tram",
    "BUS": "bus",
    "COACH": "bus",
    "FERRY": "ferry",
}
MODE_ZH: dict[StepMode, str] = {
    "walk": "步行",
    "train": "電車",
    "shinkansen": "新幹線",
    "subway": "地鐵",
    "tram": "路面電車",
    "bus": "公車",
    "ferry": "渡輪",
    "other": "交通",
}


def maps_link(origin: LatLng, destination: LatLng) -> str:
    """Google Maps directions by public transport: the traveller can always check there."""
    return (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={origin.lat:.5f},{origin.lng:.5f}&destination={destination.lat:.5f},{destination.lng:.5f}"
        "&travelmode=transit"
    )


# Operators whose feeds miss what they run or what they call it.
OPERATORS: dict[str, tuple[str, StepMode]] = {
    "函館市企業局": ("函館市電", "tram"),
}

CJK = re.compile(r"[\u3040-\u30ff\u3400-\u9fff々〆ー]")


def _japanese(text: str) -> str:
    """Keep the Japanese words of a bilingual name: "JR中央線快速 JR Chūō Rapid Line" → "JR中央線快速"."""
    text = re.sub(r"\([^)]*\)|（[^）]*）", " ", text)
    words = [w for w in text.split() if CJK.search(w)]
    return " ".join(words) if words else text.strip()


def _line_name(leg: dict[str, Any]) -> str:
    """e.g. "JR中央線快速", "はやぶさ18号"; codes that are only numbers give way to the operator's name."""
    agency = (leg.get("agencyName") or "").strip()
    if agency in OPERATORS:
        return OPERATORS[agency][0]
    for key in ("routeLongName", "routeShortName", "tripShortName"):
        value = _japanese(leg.get(key) or "")
        if value and not value.isdigit() and len(value) > 2:
            return value
    return _japanese(agency)


def _mode(leg: dict[str, Any]) -> StepMode:
    agency = (leg.get("agencyName") or "").strip()
    if agency in OPERATORS:
        return OPERATORS[agency][1]
    # GTFS route types beat the router's coarse mode: 0/9xx tram, 1/4xx subway, 3/7xx bus.
    rt = leg.get("routeType")
    if isinstance(rt, int):
        if rt == 0 or 900 <= rt < 1000:
            return "tram"
        if rt == 1 or 400 <= rt < 500:
            return "subway"
        if rt == 3 or 700 <= rt < 800:
            return "bus"
    return MODES.get(leg.get("mode", ""), "other")


def _towards(leg: dict[str, Any]) -> str:
    """The direction, as on the platform signs: "高尾" from "(中央特快 Chuo Special Rapid) 高尾 Takao"."""
    return _japanese(leg.get("headsign") or "")


def parse_itinerary(itinerary: dict[str, Any], origin: LatLng, destination: LatLng) -> Leg:
    rides: list[LegStep] = []
    walked_m = 0.0
    for part in itinerary.get("legs", []):
        mode = part.get("mode", "")
        if mode == "WALK":
            walked_m += part.get("distance") or 0
            continue
        towards = _towards(part)
        name = _line_name(part)
        rides.append(
            LegStep(
                mode=_mode(part),
                line=f"{name}（往 {towards}）" if towards and towards not in name else name,
                from_name=(part.get("from") or {}).get("name", ""),
                to_name=(part.get("to") or {}).get("name", ""),
                minutes=max(1, round((part.get("duration") or 0) / 60)),
            )
        )
    minutes = max(1, round((itinerary.get("duration") or 0) / 60))
    distance = round(walked_m + sum((p.get("distance") or 0) for p in itinerary.get("legs", []) if p.get("mode") != "WALK"))
    if not rides:
        return Leg(mode="walk", minutes=minutes, distance_m=distance, summary=f"步行 {minutes} 分", maps_url=maps_link(origin, destination))
    lines = "→".join(f"{MODE_ZH[r.mode]} {r.line}".strip() for r in rides)
    return Leg(
        mode="transit",
        minutes=minutes,
        distance_m=distance,
        summary=f"{lines}，共 {minutes} 分",
        steps=rides,
        maps_url=maps_link(origin, destination),
    )


class TransitousRouteProvider:
    def __init__(self, client: httpx2.AsyncClient):
        self.client = client
        self.gate = asyncio.Semaphore(MAX_PARALLEL)

    async def transit(self, origin: LatLng, destination: LatLng, *, at: datetime, arrive_by: bool) -> Leg | None:
        params = {
            "fromPlace": f"{origin.lat:.6f},{origin.lng:.6f}",
            "toPlace": f"{destination.lat:.6f},{destination.lng:.6f}",
            "time": at.isoformat(),
            "arriveBy": "true" if arrive_by else "false",
            "numItineraries": "1",
        }
        async with self.gate:
            try:
                res = await self.client.get(PLAN_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=20)
            except httpx2.HTTPError as exc:
                raise RoutesError(str(exc)) from exc
        if res.status_code != 200:
            raise RoutesError(f"Transitous HTTP {res.status_code}")
        itineraries = res.json().get("itineraries") or []
        return parse_itinerary(itineraries[0], origin, destination) if itineraries else None
