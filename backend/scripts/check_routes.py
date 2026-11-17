"""Does Google's Routes API return public transport directions in Japan?

One real request (a few yen): 函館駅 → 五稜郭公園 by transit, next weekday at
10:00 Japan time. Prints the legs it finds, never the key.

    uv run python -m scripts.check_routes
"""

import asyncio
from datetime import datetime, timedelta, timezone

import httpx2

from app.config import get_settings

URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
FIELDS = ",".join([
    "routes.duration",
    "routes.distanceMeters",
    "routes.legs.steps.travelMode",
    "routes.legs.steps.staticDuration",
    "routes.legs.steps.transitDetails.transitLine.name",
    "routes.legs.steps.transitDetails.transitLine.vehicle.type",
    "routes.legs.steps.transitDetails.stopDetails.departureStop.name",
    "routes.legs.steps.transitDetails.stopDetails.arrivalStop.name",
])

HAKODATE_STATION = {"latitude": 41.7737, "longitude": 140.7264}
GORYOKAKU_PARK = {"latitude": 41.7969, "longitude": 140.7570}


def next_weekday_10am_jst() -> str:
    jst = timezone(timedelta(hours=9))
    day = datetime.now(jst) + timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day.replace(hour=10, minute=0, second=0, microsecond=0).isoformat()


async def main() -> None:
    key = get_settings().google_places_api_key
    if not key:
        print("GOOGLE_PLACES_API_KEY is not set in backend/.env")
        return
    body = {
        "origin": {"location": {"latLng": HAKODATE_STATION}},
        "destination": {"location": {"latLng": GORYOKAKU_PARK}},
        "travelMode": "TRANSIT",
        "departureTime": next_weekday_10am_jst(),
        "languageCode": "ja",
        "regionCode": "JP",
    }
    async with httpx2.AsyncClient(timeout=20) as client:
        res = await client.post(URL, json=body, headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS})
    print("HTTP", res.status_code)
    data = res.json()
    if res.status_code != 200:
        err = data.get("error", {})
        print(err.get("status"), "-", err.get("message", "")[:300])
        return
    routes = data.get("routes", [])
    if not routes:
        print("No route returned: transit directions look unavailable here.")
        return
    r = routes[0]
    print(f"total {r.get('duration')} · {r.get('distanceMeters')} m")
    for step in r["legs"][0].get("steps", []):
        t = step.get("transitDetails")
        if t:
            line = t.get("transitLine", {})
            stops = t.get("stopDetails", {})
            print(
                f"  {line.get('vehicle', {}).get('type')}: {line.get('name')} "
                f"{stops.get('departureStop', {}).get('name')} → {stops.get('arrivalStop', {}).get('name')} "
                f"({step.get('staticDuration')})"
            )
        else:
            print(f"  {step.get('travelMode')} ({step.get('staticDuration')})")


if __name__ == "__main__":
    asyncio.run(main())
