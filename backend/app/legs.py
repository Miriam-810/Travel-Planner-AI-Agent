"""How to get between the places of a day: hotel → first stop → … → last stop → hotel.

Each leg tries, in order:
1. Very close (a few minutes' walk): walking, no request needed.
2. The country's public transport router (Transitous for Japan).
3. No route found but walkable: walking, estimated from the distance.
4. Otherwise: just the distance, and a Google Maps link to look up the trains.
"""

import asyncio
import math
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models import Leg, LodgingInput, Stop
from app.providers.base import LatLng, RouteProvider, RoutesError
from app.providers.transitous import maps_link

WALK_ONLY_M = 600  # closer than this: just walk
WALK_FALLBACK_M = 1500  # no route found, but still a reasonable walk
LONGEST_WALK_MIN = 30  # a router "walk" longer than this isn't much help
WALK_M_PER_MIN = 75
DETOUR = 1.3  # streets are longer than the straight line

# Same places at about the same time give the same answer: don't ask twice.
_cache: dict[tuple, Leg | None] = {}
CACHE_SIZE = 2000


def distance_m(a: LatLng, b: LatLng) -> float:
    r = 6_371_000
    la1, la2 = math.radians(a.lat), math.radians(b.lat)
    dla, dln = la2 - la1, math.radians(b.lng - a.lng)
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dln / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def walking(a: LatLng, b: LatLng, straight_m: float) -> Leg:
    metres = round(straight_m * DETOUR)
    minutes = max(1, round(metres / WALK_M_PER_MIN))
    return Leg(mode="walk", minutes=minutes, distance_m=metres, summary=f"步行約 {minutes} 分", maps_url=maps_link(a, b))


def far(a: LatLng, b: LatLng, straight_m: float) -> Leg:
    return Leg(
        mode="far",
        minutes=None,
        distance_m=round(straight_m),
        summary=f"相距約 {straight_m / 1000:.1f} 公里，可以用 Google 地圖查電車",
        maps_url=maps_link(a, b),
    )


async def leg_between(a: LatLng, b: LatLng, *, at: datetime, arrive_by: bool, routes: RouteProvider | None) -> Leg:
    straight = distance_m(a, b)
    if straight <= WALK_ONLY_M:
        return walking(a, b, straight)
    if routes is not None:
        # Round the time to the half hour so nearby requests share the cache.
        slot = at.replace(minute=0 if at.minute < 30 else 30, second=0, microsecond=0)
        key = (round(a.lat, 4), round(a.lng, 4), round(b.lat, 4), round(b.lng, 4), slot.isoformat(), arrive_by)
        if key in _cache:
            found = _cache[key]
        else:
            try:
                found = await routes.transit(a, b, at=slot, arrive_by=arrive_by)
            except RoutesError:
                found = None  # not cached: the service may be back next time
            else:
                if len(_cache) >= CACHE_SIZE:
                    _cache.pop(next(iter(_cache)))
                _cache[key] = found
        if found is not None and not (found.mode == "walk" and (found.minutes or 0) > LONGEST_WALK_MIN):
            return found
    if straight <= WALK_FALLBACK_M:
        return walking(a, b, straight)
    return far(a, b, straight)


def _at(day: date, t: time, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, t, tzinfo=tz)


def _hotel(lodging: LodgingInput | None) -> LatLng | None:
    if lodging is None or lodging.lat is None or lodging.lng is None:
        return None
    return LatLng(lodging.lat, lodging.lng)


async def day_legs(
    day: date,
    stops: list[Stop],
    *,
    morning_hotel: LodgingInput | None,
    night_hotel: LodgingInput | None,
    tz: ZoneInfo,
    routes: RouteProvider | None,
) -> tuple[list[Leg | None], Leg | None]:
    """The leg into each stop (None for the first stop when we don't know where the day starts),
    and the leg from the last stop to tonight's hotel (None when that hotel's place is unknown)."""
    points = [LatLng(s.lat, s.lng) for s in stops]
    jobs = []
    start = _hotel(morning_hotel)
    if start is not None and stops:
        # Arrive at the first stop on time.
        jobs.append(leg_between(start, points[0], at=_at(day, stops[0].arrive, tz), arrive_by=True, routes=routes))
    for prev, here, a, b in zip(stops, stops[1:], points, points[1:], strict=False):
        leave = _at(day, prev.arrive, tz) + timedelta(minutes=prev.stay_min)
        jobs.append(leg_between(a, b, at=leave, arrive_by=False, routes=routes))
    end = _hotel(night_hotel)
    if end is not None and stops:
        last = stops[-1]
        leave = _at(day, last.arrive, tz) + timedelta(minutes=last.stay_min)
        jobs.append(leg_between(points[-1], end, at=leave, arrive_by=False, routes=routes))

    results = list(await asyncio.gather(*jobs))
    into: list[Leg | None] = [results.pop(0) if start is not None and stops else None]
    into += [results.pop(0) for _ in stops[1:]]
    to_hotel = results.pop(0) if end is not None and stops else None
    return into, to_hotel
