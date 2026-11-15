"""Opening-hours checks on Google Places `openingHours.periods`.

Google numbers days 0 = Sunday … 6 = Saturday. A period whose close falls on a
later day runs past midnight (e.g. a bar open Fri 18:00 → Sat 02:00). A single
period that opens Sunday 00:00 and has no close means open 24 hours.

Every period becomes an interval in "minutes since Sunday 00:00"; a planned
stay counts as open only if one interval covers the whole stay.
"""

from datetime import date, time

WEEK_MIN = 7 * 24 * 60
DAY_MIN = 24 * 60


def google_day(day: date) -> int:
    """Python's Monday = 0 → Google's Sunday = 0."""
    return (day.weekday() + 1) % 7


def _point(p: dict) -> int:
    return p.get("day", 0) * DAY_MIN + p.get("hour", 0) * 60 + p.get("minute", 0)


def is_always_open(periods: list[dict]) -> bool:
    return len(periods) == 1 and "close" not in periods[0]


def _intervals(periods: list[dict]) -> list[tuple[int, int]]:
    out = []
    for p in periods:
        if "open" not in p or "close" not in p:
            continue
        start, end = _point(p["open"]), _point(p["close"])
        if end <= start:  # wraps past Saturday night into Sunday
            end += WEEK_MIN
        out.append((start, end))
    return out


def is_open_for_stay(periods: list[dict], day: date, arrive: time, stay_min: int) -> bool:
    """True if the place is open from `arrive` until `arrive + stay_min` on `day`."""
    if is_always_open(periods):
        return True
    start = google_day(day) * DAY_MIN + arrive.hour * 60 + arrive.minute
    end = start + stay_min
    for open_, close in _intervals(periods):
        # Shift by a week either way so Saturday-night periods cover early Sunday.
        for shift in (-WEEK_MIN, 0, WEEK_MIN):
            if open_ + shift <= start and end <= close + shift:
                return True
    return False


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60 % 24:02d}:{minutes % 60:02d}"


def hours_text(periods: list[dict], day: date) -> str:
    """Hours of the periods that open on `day`, e.g. '11:00–14:30, 17:00–翌 02:00'; '休息' if none."""
    if is_always_open(periods):
        return "24 小時"
    gday = google_day(day)
    todays = sorted(_intervals([p for p in periods if p.get("open", {}).get("day") == gday]))
    if not todays:
        return "休息"
    parts = []
    for open_, close in todays:
        if close - open_ >= DAY_MIN:
            parts.append("24 小時")
            continue
        next_day = close // DAY_MIN != open_ // DAY_MIN
        parts.append(f"{_hhmm(open_)}–{'翌 ' if next_day else ''}{_hhmm(close)}")
    return ", ".join(parts)
