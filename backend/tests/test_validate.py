from datetime import time

from app.agent.validate import required_meals, validate_outline
from app.models import TripOutline
from tests.agent_fixtures import PLACES, REQUEST, TODAY, stop, valid_outline


def check(outline: dict) -> list[str]:
    return validate_outline(REQUEST, TripOutline.model_validate(outline), PLACES, today=TODAY)


def test_valid_outline_passes():
    assert check(valid_outline()) == []


def test_missing_and_duplicate_dates():
    o = valid_outline()
    o["days"][2]["date"] = "2026-12-08"
    (err,) = check(o)
    assert "缺少 12/9" in err and "重複 12/8" in err


def test_missing_dinner():
    o = valid_outline()
    o["days"][1]["stops"].pop()
    assert check(o) == ["12/8 缺少晚餐"]


def test_meal_outside_window():
    o = valid_outline()
    o["days"][1]["stops"][0]["arrive"] = "15:00"
    errors = check(o)
    assert any("午餐「lunch」15:00 抵達，應在 10:30–14:30 之間" in e for e in errors)


def test_overlapping_stops():
    o = valid_outline()
    o["days"][1]["stops"][1]["arrive"] = "12:00"  # lunch 11:30 + 60 min runs to 12:30
    assert any("重疊或順序顛倒" in e for e in check(o))


def test_first_stop_too_soon_after_landing():
    o = valid_outline()
    o["days"][0]["stops"][0]["arrive"] = "10:30"
    assert any("班機 10:00 抵達" in e and "最早 11:00" in e for e in check(o))


def test_last_stop_too_close_to_departure():
    o = valid_outline()
    o["days"][4]["stops"].append(stop("museum", "15:30", 60))
    assert any("班機 18:00 起飛" in e and "16:00 前離開" in e for e in check(o))


def test_place_not_from_search():
    o = valid_outline()
    o["days"][1]["stops"][1]["place_id"] = "invented"
    assert any("不是 search_place 查到的結果" in e for e in check(o))


def test_closed_business():
    o = valid_outline()
    o["days"][1]["stops"][1]["place_id"] = "gone"
    assert any("CLOSED_PERMANENTLY" in e for e in check(o))


def test_closed_during_stay():
    o = valid_outline()
    o["days"][1]["stops"][2]["arrive"] = "16:30"  # shop until 17:30
    o["days"][1]["stops"][3].update(arrive="20:30", stay_min=120)  # dinner till 22:30, closes 22:00
    assert check(o) == ["12/8「dinner」20:30 抵達、停留 120 分鐘，不在營業時間內（當天 17:00–22:00），請調整時間或換一家"]


def test_closed_day():
    o = valid_outline()
    o["days"][0]["stops"][1]["place_id"] = "museum"  # Monday
    assert any("當天 休息" in e for e in check(o))


def test_full_day_needs_two_activities():
    o = valid_outline()
    o["days"][2]["stops"].pop(2)  # drop the shop; museum ends 15:00, dinner 18:00 → 3h is still fine
    assert check(o) == ["12/9 是完整的一天，除了用餐至少要有 2 個景點或購物點（目前 1 個）"]


def test_arrival_day_is_not_a_full_day():
    o = valid_outline()  # day 1 has only the park
    assert not any("12/7 是完整的一天" in e for e in check(o))


def test_gap_over_three_hours():
    o = valid_outline()
    o["days"][2]["stops"] = [o["days"][2]["stops"][i] for i in (0, 1, 2)] + [stop("dinner", "20:00", 60, "meal", "dinner")]
    (err,) = check(o)
    assert err == (
        "12/9「shop」16:30 離開後，到「dinner」20:00 之間空了 3 小時 30 分，"
        "請在中間加景點或購物點，空檔不要超過 3 小時"
    )


def test_place_without_hours_is_allowed():
    o = valid_outline()  # day 1 and day 5 use "park", which has no hours
    assert check(o) == []


def test_required_meals_follow_flight_times():
    early, late = REQUEST.model_copy(update={"arrival_time": None}), REQUEST
    assert required_meals(REQUEST.start_date, late) == {"lunch", "dinner"}
    assert required_meals(REQUEST.end_date, late) == {"lunch"}  # 18:00 flight
    assert required_meals(REQUEST.start_date, REQUEST.model_copy(update={"arrival_time": time(16, 0)})) == {"dinner"}
    assert required_meals(REQUEST.start_date, early) == {"lunch", "dinner"}
