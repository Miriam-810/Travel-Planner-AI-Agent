"""Manual smoke test against the real Open-Meteo API.

    uv run python -m scripts.check_weather            # Aomori, 12/25 and 3 days from now
    uv run python -m scripts.check_weather 41.77 140.73 2026-12-30
"""

import asyncio
import sys
from datetime import date, timedelta

import httpx2

from app.tools.weather import WeatherError, get_weather, today_in_japan


async def main() -> None:
    if len(sys.argv) == 4:
        lat, lng, days = float(sys.argv[1]), float(sys.argv[2]), [date.fromisoformat(sys.argv[3])]
    else:
        lat, lng = 40.8244, 140.7400  # Aomori
        days = [today_in_japan() + timedelta(days=3), date(today_in_japan().year, 12, 25)]

    async with httpx2.AsyncClient() as client:
        for day in days:
            try:
                w = await get_weather(lat, lng, day, client=client)
                print(f"{day}  {w.source:<11} {w.summary}  {w.high_c}° / {w.low_c}°  降水 {w.precip_mm} mm")
            except WeatherError as exc:
                print(f"{day}  failed: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
