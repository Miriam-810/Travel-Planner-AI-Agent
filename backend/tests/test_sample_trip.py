from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app, load_sample_trip

client = TestClient(app)


def test_sample_endpoint_returns_trip():
    response = client.get("/api/trips/sample")

    assert response.status_code == 200
    body = response.json()
    assert body["destination"] == "青森・函館"
    assert body["sample"] is True


def test_sample_days_cover_every_date_once():
    trip = load_sample_trip()
    expected = [trip.start_date + timedelta(days=i) for i in range((trip.end_date - trip.start_date).days + 1)]
    assert [d.date for d in trip.days] == expected


def test_sample_stop_ids_are_unique_and_times_ascend():
    trip = load_sample_trip()
    ids = [s.id for d in trip.days for s in d.stops]
    assert len(ids) == len(set(ids))
    for day in trip.days:
        arrives = [s.arrive for s in day.stops]
        assert arrives == sorted(arrives), day.date


def test_sample_has_lunch_and_dinner_except_flight_days():
    trip = load_sample_trip()
    first, last = trip.days[0].date, trip.days[-1].date
    for day in trip.days:
        meals = {s.meal for s in day.stops if s.kind == "meal"}
        if day.date != first:  # lands 14:20, no lunch
            assert "lunch" in meals, day.date
        if day.date != last:  # flies 15:30, no dinner
            assert "dinner" in meals, day.date


def test_sample_every_stop_has_hours_record():
    trip = load_sample_trip()
    for day in trip.days:
        for stop in day.stops:
            assert stop.hours is not None, stop.id
            assert stop.hours.business_status == "OPERATIONAL"
