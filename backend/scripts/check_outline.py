"""Run the planning agent once against the real APIs and print the outline.

Needs ANTHROPIC_API_KEY and GOOGLE_PLACES_API_KEY in backend/.env. Costs money:
one run is roughly 20–45 Places searches plus the Claude tokens printed at the end.

    uv run python -m scripts.check_outline            # 5 days in Aomori, early December
"""

import asyncio
import logging
import sys
from datetime import date, time

import anthropic
import httpx2

from app.agent.loop import AgentError, run_agent
from app.config import get_settings
from app.models import LodgingInput, TripRequest
from app.tools.places import search_place
from app.tools.weather import get_weather, today_in_japan

REQUEST = TripRequest(
    destination="青森",
    start_date=date(2026, 12, 7),
    end_date=date(2026, 12, 11),
    arrival_time=time(10, 30),
    departure_time=time(17, 0),
    travelers=2,
    preferences=["美食", "溫泉", "不想太趕"],
    lodgings=[LodgingInput(name="青森站前飯店", check_in=date(2026, 12, 7), check_out=date(2026, 12, 11))],
)


async def main() -> None:
    s = get_settings()
    if not s.anthropic_api_key or not s.google_places_api_key:
        sys.exit("Set ANTHROPIC_API_KEY and GOOGLE_PLACES_API_KEY in backend/.env first")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("httpx2").setLevel(logging.WARNING)

    async with httpx2.AsyncClient() as http, anthropic.AsyncAnthropic(api_key=s.anthropic_api_key, timeout=180) as llm:

        async def search(q, lat, lng, r):
            return await search_place(q, lat, lng, radius_m=r, client=http, api_key=s.google_places_api_key)

        async def weather(lat, lng, d):
            return await get_weather(lat, lng, d, client=http)

        try:
            result = await run_agent(
                REQUEST, llm=llm, model=s.model, effort=s.effort, search=search, weather=weather, today=today_in_japan()
            )
        except AgentError as exc:
            sys.exit(f"failed: {exc}")

    for day in result.outline.days:
        print(f"\n{day.date}  {day.title}（{day.area}）")
        for st in day.stops:
            meal = f"[{st.meal}]" if st.meal else ""
            print(f"  {st.arrive:%H:%M} +{st.stay_min:>3}m  {st.kind}{meal}  {st.name}  — {st.note}")
    print("\nwarnings:", result.warnings or "none")
    st = result.stats
    print(
        f"model={st.model} turns={st.turns} tool_calls={st.tool_calls} searches={st.searches} "
        f"weather={st.weather_calls} submits={st.submits}\n"
        f"tokens: input={st.input_tokens} cache_read={st.cache_read_tokens} cache_write={st.cache_write_tokens} "
        f"output={st.output_tokens} max_prompt={st.max_prompt_tokens}\n"
        f"cost: Claude ≈ ${st.claude_usd}  Places ≈ ${st.places_usd} (after the monthly free 1,000 searches)"
    )


if __name__ == "__main__":
    asyncio.run(main())
