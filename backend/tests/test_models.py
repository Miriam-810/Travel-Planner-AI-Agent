from datetime import date, time, timedelta

import pytest
from pydantic import ValidationError

from app.models import LodgingInput, StopDraft, TripOutline, TripRequest


def make_request(**overrides):
    data = dict(
        destination="青森・函館",
        start_date=date(2026, 12, 25),
        end_date=date(2027, 1, 1),
        travelers=2,
    )
    data.update(overrides)
    return TripRequest(**data)


def make_stop(**overrides):
    data = dict(name="きくよ食堂", kind="meal", meal="lunch", place_id="p1", arrive=time(12, 0), stay_min=60)
    data.update(overrides)
    return StopDraft(**data)


class TestTripRequest:
    def test_valid_eight_day_trip(self):
        req = make_request()
        assert (req.end_date - req.start_date).days + 1 == 8

    @pytest.mark.parametrize("days", [4, 9])
    def test_rejects_trip_outside_five_to_eight_days(self, days):
        start = date(2026, 12, 25)
        with pytest.raises(ValidationError, match="trip must be"):
            make_request(start_date=start, end_date=start + timedelta(days=days - 1))

    def test_rejects_end_before_start(self):
        with pytest.raises(ValidationError, match="end_date"):
            make_request(start_date=date(2026, 12, 25), end_date=date(2026, 12, 20))

    def test_rejects_zero_travelers(self):
        with pytest.raises(ValidationError):
            make_request(travelers=0)

    def test_rejects_lodging_with_checkout_before_checkin(self):
        with pytest.raises(ValidationError, match="check_out"):
            LodgingInput(name="Dormy Inn", check_in=date(2026, 12, 31), check_out=date(2026, 12, 31))


class TestStopDraft:
    def test_meal_stop_needs_meal_type(self):
        with pytest.raises(ValidationError, match="meal stop"):
            make_stop(meal=None)

    def test_non_meal_stop_cannot_set_meal(self):
        with pytest.raises(ValidationError, match="only meal stops"):
            make_stop(kind="sight", meal="lunch")

    def test_place_id_is_required(self):
        with pytest.raises(ValidationError):
            make_stop(place_id="")

    def test_outline_needs_at_least_one_stop_per_day(self):
        with pytest.raises(ValidationError):
            TripOutline(days=[dict(date="2026-12-25", title="x", area="青森", area_lat=40.8, area_lng=140.7, stops=[])])
