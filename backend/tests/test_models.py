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

    @pytest.mark.parametrize("days", [1, 10])
    def test_accepts_one_to_ten_days(self, days):
        start = date(2026, 12, 25)
        req = make_request(start_date=start, end_date=start + timedelta(days=days - 1))
        assert (req.end_date - req.start_date).days + 1 == days

    @pytest.mark.parametrize("days", [11, 14])
    def test_rejects_trips_over_ten_days(self, days):
        start = date(2026, 12, 25)
        with pytest.raises(ValidationError, match="trip must be"):
            make_request(start_date=start, end_date=start + timedelta(days=days - 1))

    def test_one_day_trip_needs_arrival_before_departure(self):
        day = date(2026, 12, 25)
        with pytest.raises(ValidationError, match="arrival must be before the departure"):
            make_request(start_date=day, end_date=day, arrival_time=time(18, 0), departure_time=time(9, 0))
        ok = make_request(start_date=day, end_date=day, arrival_time=time(9, 0), departure_time=time(20, 0))
        assert ok.start_date == ok.end_date

    @pytest.mark.parametrize(
        ("check_in", "check_out"),
        [(date(2026, 12, 24), date(2026, 12, 26)), (date(2026, 12, 31), date(2027, 1, 2)), (date(2027, 2, 1), date(2027, 2, 3))],
    )
    def test_lodging_must_be_within_the_trip(self, check_in, check_out):
        with pytest.raises(ValidationError, match="within the trip"):
            make_request(lodgings=[{"name": "飯店", "check_in": check_in, "check_out": check_out}])

    def test_lodging_may_check_out_on_the_last_day(self):
        req = make_request(lodgings=[{"name": "飯店", "check_in": date(2026, 12, 25), "check_out": date(2027, 1, 1)}])
        assert req.lodgings[0].check_out == req.end_date

    def test_lodgings_must_not_overlap(self):
        with pytest.raises(ValidationError, match="overlap"):
            make_request(lodgings=[
                {"name": "A", "check_in": date(2026, 12, 25), "check_out": date(2026, 12, 28)},
                {"name": "B", "check_in": date(2026, 12, 27), "check_out": date(2026, 12, 30)},
            ])

    def test_back_to_back_lodgings_are_fine(self):
        req = make_request(lodgings=[
            {"name": "A", "check_in": date(2026, 12, 25), "check_out": date(2026, 12, 28)},
            {"name": "B", "check_in": date(2026, 12, 28), "check_out": date(2026, 12, 31)},
        ])
        assert len(req.lodgings) == 2

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
