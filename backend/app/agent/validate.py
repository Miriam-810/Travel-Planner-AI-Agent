"""Program-side checks on the outline Claude submits (docs/PLAN.md, Agent rules 1–5).

Rule 6 (holiday-season hours caveat) is a warning, not an error, and is added
by trip_builder when the finished trip is built.

Messages are in Chinese: they go back to Claude as the tool error, and if the
outline still fails after the retries, they are shown to the user as warnings.
"""

from collections.abc import Mapping
from datetime import date, datetime, time, timedelta

from app.models import DayDraft, StopDraft, TripOutline, TripRequest
from app.tools.hours import is_open_for_stay
from app.tools.places import Place

# Time to get from the airport to the first stop, and back for the flight home.
ARRIVAL_BUFFER = timedelta(minutes=60)
DEPARTURE_BUFFER = timedelta(minutes=120)

# Meal arrival windows.
LUNCH_WINDOW = (time(10, 30), time(14, 30))
DINNER_WINDOW = (time(17, 0), time(21, 0))

# Arrival day: skip lunch if landing after 11:00, dinner if after 19:00.
# Departure day: lunch only if the flight is 15:00 or later, dinner only if 21:00 or later.
ARRIVAL_LUNCH_CUTOFF = time(11, 0)
ARRIVAL_DINNER_CUTOFF = time(19, 0)
DEPARTURE_LUNCH_FROM = time(15, 0)
DEPARTURE_DINNER_FROM = time(21, 0)

# A full day (not cut short by a flight) needs this many sights or shops, and no
# day may leave a longer gap between one stop ending and the next starting.
MIN_ACTIVITIES_FULL_DAY = 2
MAX_GAP = timedelta(hours=3)

MEAL_ZH = {"lunch": "午餐", "dinner": "晚餐"}


def _md(d: date) -> str:
    return f"{d.month}/{d.day}"


def _end(day: date, stop: StopDraft) -> datetime:
    return datetime.combine(day, stop.arrive) + timedelta(minutes=stop.stay_min)


def required_meals(day: date, request: TripRequest) -> set[str]:
    meals = {"lunch", "dinner"}
    if day == request.start_date and request.arrival_time:
        if request.arrival_time > ARRIVAL_LUNCH_CUTOFF:
            meals.discard("lunch")
        if request.arrival_time > ARRIVAL_DINNER_CUTOFF:
            meals.discard("dinner")
    if day == request.end_date and request.departure_time:
        if request.departure_time < DEPARTURE_LUNCH_FROM:
            meals.discard("lunch")
        if request.departure_time < DEPARTURE_DINNER_FROM:
            meals.discard("dinner")
    return meals


def is_full_day(day: date, request: TripRequest) -> bool:
    """False for the arrival and departure days when the flight times are known."""
    if day == request.start_date and request.arrival_time:
        return False
    if day == request.end_date and request.departure_time:
        return False
    return True


def validate_outline(
    request: TripRequest, outline: TripOutline, places: Mapping[str, Place], *, today: date
) -> list[str]:
    """Return the problems found; an empty list means the outline is accepted."""
    errors = _check_dates(request, outline)
    for day in outline.days:
        errors += _check_meals(day, request)
        errors += _check_order(day)
        errors += _check_fullness(day, request)
        errors += _check_flights(day, request)
        for stop in day.stops:
            errors += _check_place(day.date, stop, places, today)
    return errors


def _check_dates(request: TripRequest, outline: TripOutline) -> list[str]:
    want = [request.start_date + timedelta(days=i) for i in range((request.end_date - request.start_date).days + 1)]
    got = [d.date for d in outline.days]
    if got == want:
        return []
    missing = [_md(d) for d in want if d not in got]
    extra = sorted({_md(d) for d in got if d not in want or got.count(d) > 1})
    parts = []
    if missing:
        parts.append(f"缺少 {', '.join(missing)}")
    if extra:
        parts.append(f"多出或重複 {', '.join(extra)}")
    if not parts:
        parts.append("日期順序不對")
    return [f"行程日期必須是 {_md(want[0])}–{_md(want[-1])} 每天一筆、依序排列：" + "；".join(parts)]


def _check_meals(day: DayDraft, request: TripRequest) -> list[str]:
    errors = []
    meals = [s for s in day.stops if s.kind == "meal"]
    for meal in ("lunch", "dinner"):
        found = [s for s in meals if s.meal == meal]
        if meal in required_meals(day.date, request) and not found:
            errors.append(f"{_md(day.date)} 缺少{MEAL_ZH[meal]}")
        if len(found) > 1:
            errors.append(f"{_md(day.date)} 有 {len(found)} 個{MEAL_ZH[meal]}，只能有一個")
        window = LUNCH_WINDOW if meal == "lunch" else DINNER_WINDOW
        for s in found:
            if not window[0] <= s.arrive <= window[1]:
                errors.append(
                    f"{_md(day.date)} {MEAL_ZH[meal]}「{s.name}」{s.arrive:%H:%M} 抵達，"
                    f"應在 {window[0]:%H:%M}–{window[1]:%H:%M} 之間"
                )
    return errors


def _check_order(day: DayDraft) -> list[str]:
    errors = []
    for prev, nxt in zip(day.stops, day.stops[1:]):
        if _end(day.date, prev) > datetime.combine(day.date, nxt.arrive):
            errors.append(
                f"{_md(day.date)}「{prev.name}」{prev.arrive:%H:%M} 起停留 {prev.stay_min} 分鐘，"
                f"和下一站「{nxt.name}」{nxt.arrive:%H:%M} 重疊或順序顛倒"
            )
    return errors


def _check_fullness(day: DayDraft, request: TripRequest) -> list[str]:
    errors = []
    activities = sum(1 for s in day.stops if s.kind != "meal")
    if is_full_day(day.date, request) and activities < MIN_ACTIVITIES_FULL_DAY:
        errors.append(
            f"{_md(day.date)} 是完整的一天，除了用餐至少要有 {MIN_ACTIVITIES_FULL_DAY} 個景點或購物點（目前 {activities} 個）"
        )
    for prev, nxt in zip(day.stops, day.stops[1:]):
        gap = datetime.combine(day.date, nxt.arrive) - _end(day.date, prev)
        if gap > MAX_GAP:
            hours, minutes = divmod(gap.seconds // 60, 60)
            errors.append(
                f"{_md(day.date)}「{prev.name}」{_end(day.date, prev):%H:%M} 離開後，到「{nxt.name}」{nxt.arrive:%H:%M} "
                f"之間空了 {hours} 小時 {minutes} 分，請在中間加景點或購物點，空檔不要超過 {MAX_GAP.seconds // 3600} 小時"
            )
    return errors


def _check_flights(day: DayDraft, request: TripRequest) -> list[str]:
    errors = []
    if day.date == request.start_date and request.arrival_time:
        earliest = datetime.combine(day.date, request.arrival_time) + ARRIVAL_BUFFER
        first = day.stops[0]
        if datetime.combine(day.date, first.arrive) < earliest:
            errors.append(
                f"{_md(day.date)} 班機 {request.arrival_time:%H:%M} 抵達，"
                f"第一站「{first.name}」最早 {earliest:%H:%M} 才能到"
            )
    if day.date == request.end_date and request.departure_time:
        latest = datetime.combine(day.date, request.departure_time) - DEPARTURE_BUFFER
        last = day.stops[-1]
        if _end(day.date, last) > latest:
            errors.append(
                f"{_md(day.date)} 班機 {request.departure_time:%H:%M} 起飛，"
                f"最後一站「{last.name}」要在 {latest:%H:%M} 前離開"
            )
    return errors


def _check_place(day: date, stop: StopDraft, places: Mapping[str, Place], today: date) -> list[str]:
    place = places.get(stop.place_id)
    label = f"{_md(day)}「{stop.name}」"
    if place is None:
        return [f"{label}的 place_id {stop.place_id} 不是 search_place 查到的結果，請先用 search_place 搜尋"]
    if place.business_status != "OPERATIONAL":
        return [f"{label}在 Google 上的狀態是 {place.business_status}，請換一家"]
    periods = place.periods_for(day, today)
    if periods and not is_open_for_stay(periods, day, stop.arrive, stop.stay_min):
        hours = place.hours_on(day, today=today).today_text
        return [
            f"{label}{stop.arrive:%H:%M} 抵達、停留 {stop.stay_min} 分鐘，不在營業時間內"
            f"（當天 {hours}），請調整時間或換一家"
        ]
    return []
