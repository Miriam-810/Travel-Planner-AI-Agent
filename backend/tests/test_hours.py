from datetime import date, time

import pytest

from app.tools.hours import google_day, hours_text, is_open_for_stay

FRI = date(2026, 12, 25)  # Google day 5
SAT = date(2026, 12, 26)
SUN = date(2026, 12, 27)


def period(day, open_, close, close_day=None):
    oh, om = open_
    ch, cm = close
    return {"open": {"day": day, "hour": oh, "minute": om}, "close": {"day": day if close_day is None else close_day, "hour": ch, "minute": cm}}


def every_day(*spans):
    return [period(d, o, c) for d in range(7) for o, c in spans]


LUNCH_DINNER = every_day(((11, 0), (14, 30)), ((17, 0), (21, 0)))
ALWAYS = [{"open": {"day": 0, "hour": 0, "minute": 0}}]
# Fri 18:00 → Sat 02:00, Sat 18:00 → Sun 02:00
LATE_BAR = [period(5, (18, 0), (2, 0), close_day=6), period(6, (18, 0), (2, 0), close_day=0)]


def test_google_day_starts_on_sunday():
    assert [google_day(d) for d in (SUN, FRI, SAT)] == [0, 5, 6]


@pytest.mark.parametrize(
    ("arrive", "stay", "expected"),
    [
        (time(11, 0), 60, True),
        (time(13, 30), 60, True),  # leaves exactly at 14:30
        (time(14, 0), 60, False),  # still eating after the lunch break starts
        (time(15, 0), 30, False),  # lunch break
        (time(18, 30), 90, True),
        (time(20, 30), 60, False),
    ],
)
def test_split_lunch_and_dinner(arrive, stay, expected):
    assert is_open_for_stay(LUNCH_DINNER, FRI, arrive, stay) is expected


def test_open_24_hours():
    assert is_open_for_stay(ALWAYS, FRI, time(3, 0), 120)
    assert hours_text(ALWAYS, FRI) == "24 小時"


def test_past_midnight_counts_on_both_days():
    assert is_open_for_stay(LATE_BAR, FRI, time(23, 0), 120)  # until 01:00 Saturday
    assert is_open_for_stay(LATE_BAR, SAT, time(0, 30), 60)  # Friday's period, after midnight
    assert not is_open_for_stay(LATE_BAR, FRI, time(1, 0), 30)  # Thursday night: closed


def test_saturday_period_wraps_into_sunday_morning():
    assert is_open_for_stay(LATE_BAR, SUN, time(1, 0), 30)


def test_closed_day():
    weekdays_only = [period(d, (9, 0), (18, 0)) for d in range(1, 6)]
    assert not is_open_for_stay(weekdays_only, SAT, time(10, 0), 60)
    assert hours_text(weekdays_only, SAT) == "休息"


def test_hours_text_formats():
    assert hours_text(LUNCH_DINNER, FRI) == "11:00–14:30, 17:00–21:00"
    assert hours_text(LATE_BAR, FRI) == "18:00–翌 02:00"
