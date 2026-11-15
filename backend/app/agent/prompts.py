"""System prompt and the first user message for the planning agent."""

import json
from datetime import date, timedelta

from app.agent.validate import (
    ARRIVAL_BUFFER,
    DEPARTURE_BUFFER,
    DINNER_WINDOW,
    LUNCH_WINDOW,
    MAX_GAP,
    MIN_ACTIVITIES_FULL_DAY,
    is_full_day,
    required_meals,
)
from app.models import TripRequest
from app.providers.base import Country
from app.trip_builder import lodging_for_night


def system_prompt(country: Country) -> str:
    """The same rules for every country; only the country name and the local language differ."""
    examples = ", ".join(f"'{e}'" for e in country.name_examples)
    return f"""You plan self-guided trips in {country.name_zh} ({country.code}) for travellers from Taiwan. You turn a trip request into a day-by-day outline of sights, lunch, dinner and shops, using real places whose opening hours you have checked.

How to work:
1. Decide the main area of each day first. Keep each day within one area so travel stays short. Where the traveller has booked a hotel, the day should end near it.
2. Call get_weather once per day (all in one turn). On snowy or rainy days, prefer indoor sights.
3. Find every stop with search_place. Issue all the searches for a day, or for several days, in one turn: you have at most 12 turns and 60 tool calls in total. Each search costs money, so search about once per stop and don't search again for places you already have.
4. Call submit_outline with the whole trip. If it returns problems, fix exactly those and submit again.

Rules the program checks (an outline that breaks them comes back to you):
- One entry per date from start_date to end_date, in order.
- Every day has one lunch (arrive {LUNCH_WINDOW[0]:%H:%M}–{LUNCH_WINDOW[1]:%H:%M}) and one dinner (arrive {DINNER_WINDOW[0]:%H:%M}–{DINNER_WINDOW[1]:%H:%M}). The user message lists which meals each day needs; flight days may skip some.
- On the arrival day the first stop starts at least {ARRIVAL_BUFFER.seconds // 60} minutes after landing. On the departure day the last stop ends at least {DEPARTURE_BUFFER.seconds // 60} minutes before take-off.
- Every place_id comes from a search_place result, and the place is OPERATIONAL.
- Each stop is open for the whole stay, from arrive to arrive + stay_min, on that date. Read hours_on_date carefully: many restaurants close between lunch and dinner, and '休息' means closed all day. A null hours_on_date (common for parks, shrines and viewpoints) is allowed.
- Stops in a day are in time order and don't overlap. Leave realistic travel time between them (15–60 minutes depending on distance).
- A full day (marked "full_day" in the user message) has at least {MIN_ACTIVITIES_FULL_DAY} sights or shops besides the meals.
- No gap longer than {MAX_GAP.seconds // 3600} hours between one stop ending and the next starting, on any day. Fill the afternoon between lunch and dinner with sights, shops, a café or a hot spring.

Good plans:
- A slower pace (e.g. '不想太趕') means longer stays and fewer far-apart areas, not empty afternoons: still meet the two rules above.
- Prefer well-rated places (rating 4.0+ with a reasonable number of reviews) when there is a choice.
- stay_min is realistic: 45–75 minutes for lunch, 60–90 for dinner, 30–120 for sights.
- area_lat and area_lng are the centre of the day's main area.
- Write title, area and note in Traditional Chinese (台灣用語). Keep notes to one short sentence.
- Every stop name is '<short Traditional Chinese description>｜<the {country.local_language} name exactly as search_place returned it>', e.g. {examples}. The description tells a Taiwanese traveller what the place is; the {country.local_language} name is what they will see on the sign.
"""


def first_message(request: TripRequest, country: Country, *, today: date) -> str:
    days = (request.end_date - request.start_date).days + 1
    plan = []
    for i in range(days):
        d = request.start_date + timedelta(days=i)
        meals = sorted(required_meals(d, request), reverse=True)  # lunch, dinner
        plan.append({
            "date": d.isoformat(),
            "full_day": is_full_day(d, request),
            "meals_needed": meals,
            "hotel_tonight": lodging_for_night(d, request.lodgings),
        })
    payload = {
        "country": country.code,
        "today": today.isoformat(),
        "request": json.loads(request.model_dump_json()),
        "days": plan,
    }
    return (
        "Plan this trip. The request and the per-day requirements are below as JSON.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=1)
    )
