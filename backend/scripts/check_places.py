"""Manual smoke test against the real Google Places API (New). Needs GOOGLE_PLACES_API_KEY in backend/.env.

    uv run python -m scripts.check_places                                  # 青森站附近的拉麵, 12/25 12:00
    uv run python -m scripts.check_places "函館 朝市 海鮮丼" 41.77 140.73 2026-12-30 08:30

Each run makes 1 Text Search call (Enterprise SKU, $35 per 1,000; 1,000 free a month).
"""

import asyncio
import sys
from datetime import date, time

import httpx2

from app.config import get_settings
from app.tools.places import PlacesError, search_place


async def main() -> None:
    key = get_settings().google_places_api_key
    if not key:
        sys.exit("GOOGLE_PLACES_API_KEY is empty: add it to backend/.env (see docs/GOOGLE_PLACES_SETUP.md)")

    if len(sys.argv) == 6:
        query, lat, lng = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
        day, arrive = date.fromisoformat(sys.argv[4]), time.fromisoformat(sys.argv[5])
    else:
        query, lat, lng = "拉麵", 40.8290, 140.7340  # around Aomori station
        day, arrive = date(2026, 12, 25), time(12, 0)

    async with httpx2.AsyncClient() as client:
        try:
            places = await search_place(query, lat, lng, client=client, api_key=key)
        except PlacesError as exc:
            sys.exit(f"failed: {exc}")

    print(f"「{query}」 {day} {arrive:%H:%M} 抵達、停留 60 分：")
    for p in places:
        h = p.hours_on(day, arrive, 60)
        mark = {True: "✓ 營業中", False: "⚠ 營業時間外", None: "無營業時間資料"}[h.open_at_arrive]
        rating = f"★{p.rating} ({p.rating_count})" if p.rating else ""
        print(f"- {p.name}  {rating}\n  {p.address}\n  當天 {h.today_text or '—'}  {mark}  {p.business_status}\n  {p.place_id}")


if __name__ == "__main__":
    asyncio.run(main())
