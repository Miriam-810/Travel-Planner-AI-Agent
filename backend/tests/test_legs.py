from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest

from app import legs
from app.legs import day_legs, leg_between
from app.models import LodgingInput, Stop
from app.providers.base import LatLng, RoutesError
from app.providers.transitous import parse_itinerary

pytestmark = pytest.mark.anyio
TZ = ZoneInfo("Asia/Tokyo")
TOKYO = LatLng(35.6812, 139.7671)
SHINJUKU = LatLng(35.6896, 139.7006)
NEARBY = LatLng(35.6830, 139.7680)  # ~200 m from Tokyo Station

ITINERARY = {
    "duration": 1020,
    "legs": [
        {"mode": "WALK", "duration": 60, "distance": 80, "from": {"name": "START"}, "to": {"name": "東京"}},
        {
            "mode": "REGIONAL_RAIL", "duration": 840, "distance": 10300, "routeShortName": "JC", "routeType": 2,
            "routeLongName": "JR中央線快速 JR Chūō Rapid Line", "headsign": "(中央特快 Chuo Special Rapid) 高尾 Takao",
            "agencyName": "JR東日本 JR East", "from": {"name": "東京"}, "to": {"name": "新宿"},
        },
        {"mode": "WALK", "duration": 120, "distance": 150, "from": {"name": "新宿"}, "to": {"name": "END"}},
    ],
}  # fmt: skip


class Router:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    async def transit(self, origin, destination, *, at, arrive_by):
        self.calls.append((origin, destination, at, arrive_by))
        if self.error:
            raise self.error
        return self.result


@pytest.fixture(autouse=True)
def fresh_cache():
    legs._cache.clear()


def test_itinerary_becomes_a_transit_leg_with_its_rides():
    leg = parse_itinerary(ITINERARY, TOKYO, SHINJUKU)
    assert leg.mode == "transit" and leg.minutes == 17
    assert leg.summary == "電車 JR中央線快速（往 高尾），共 17 分"
    [ride] = leg.steps
    assert (ride.mode, ride.line, ride.from_name, ride.to_name, ride.minutes) == ("train", "JR中央線快速（往 高尾）", "東京", "新宿", 14)
    assert "travelmode=transit" in leg.maps_url


def test_walk_only_itinerary_is_a_walk():
    walk = {"duration": 600, "legs": [{"mode": "WALK", "duration": 600, "distance": 700}]}
    assert parse_itinerary(walk, TOKYO, NEARBY).mode == "walk"


AT = datetime(2026, 12, 7, 10, 40, tzinfo=TZ)


async def test_very_close_places_are_walked_without_asking():
    router = Router(result=parse_itinerary(ITINERARY, TOKYO, SHINJUKU))
    leg = await leg_between(TOKYO, NEARBY, at=AT, arrive_by=False, routes=router)
    assert leg.mode == "walk" and router.calls == []


async def test_router_result_is_used_and_cached_by_half_hour():
    router = Router(result=parse_itinerary(ITINERARY, TOKYO, SHINJUKU))
    first = await leg_between(TOKYO, SHINJUKU, at=AT, arrive_by=False, routes=router)
    again = await leg_between(TOKYO, SHINJUKU, at=AT.replace(minute=55), arrive_by=False, routes=router)
    assert first.mode == again.mode == "transit"
    assert len(router.calls) == 1 and router.calls[0][2].minute == 30


async def test_no_route_and_far_gives_distance_and_a_map_link():
    leg = await leg_between(TOKYO, SHINJUKU, at=AT, arrive_by=False, routes=Router(result=None))
    assert leg.mode == "far" and leg.minutes is None and "公里" in leg.summary


async def test_router_failure_falls_back_and_is_not_cached():
    router = Router(error=RoutesError("down"))
    leg = await leg_between(TOKYO, SHINJUKU, at=AT, arrive_by=False, routes=router)
    assert leg.mode == "far"
    await leg_between(TOKYO, SHINJUKU, at=AT, arrive_by=False, routes=router)
    assert len(router.calls) == 2


async def test_long_router_walk_is_not_much_help():
    long_walk = {"duration": 3600, "legs": [{"mode": "WALK", "duration": 3600, "distance": 7000}]}
    leg = await leg_between(TOKYO, SHINJUKU, at=AT, arrive_by=False, routes=Router(result=parse_itinerary(long_walk, TOKYO, SHINJUKU)))
    assert leg.mode == "far"


def stop(i, lat, lng, arrive, stay=60):
    return Stop(
        id=f"d1-s{i}", name=f"s{i}", kind="sight", meal=None, place_id=f"p{i}", arrive=arrive, stay_min=stay, note="",
        lat=lat, lng=lng,
    )  # fmt: skip


async def test_day_runs_hotel_to_stops_to_hotel():
    router = Router(result=parse_itinerary(ITINERARY, TOKYO, SHINJUKU))
    hotel = LodgingInput(name="H", check_in=date(2026, 12, 6), check_out=date(2026, 12, 9), lat=35.7138, lng=139.7773)  # Ueno
    stops = [stop(1, 35.6896, 139.7006, time(10, 0)), stop(2, 35.6812, 139.7671, time(12, 0))]
    into, to_hotel = await day_legs(date(2026, 12, 7), stops, morning_hotel=hotel, night_hotel=hotel, tz=TZ, routes=router)
    assert [l.mode for l in into] == ["transit", "transit"] and to_hotel is not None
    first, second, back = router.calls
    assert first[3] is True and first[2].hour == 10  # arrive by the first stop's time
    assert second[3] is False and (second[2].hour, second[2].minute) == (11, 0)  # leave after the hour's stay
    assert back[3] is False and back[2].hour == 13


async def test_day_without_hotel_places_has_no_hotel_legs():
    stops = [stop(1, 35.6896, 139.7006, time(10, 0)), stop(2, 35.6812, 139.7671, time(12, 0))]
    no_place = LodgingInput(name="民宿", check_in=date(2026, 12, 6), check_out=date(2026, 12, 9))
    into, to_hotel = await day_legs(date(2026, 12, 7), stops, morning_hotel=no_place, night_hotel=None, tz=TZ, routes=None)
    assert into[0] is None and into[1].mode == "far" and to_hotel is None


def test_hakodate_tram_and_shinkansen_read_naturally():
    tram = {"duration": 900, "legs": [{
        "mode": "REGIONAL_RAIL", "duration": 840, "distance": 4000, "routeShortName": "5963911", "routeLongName": "",
        "headsign": "湯の川", "agencyName": "函館市企業局", "routeType": 106,
    }]}  # fmt: skip
    assert parse_itinerary(tram, TOKYO, SHINJUKU).summary == "路面電車 函館市電（往 湯の川），共 15 分"
    shinkansen = {"duration": 3600, "legs": [{
        "mode": "HIGHSPEED_RAIL", "duration": 3420, "distance": 150000, "routeShortName": "はやぶさ18号",
        "headsign": "東京", "agencyName": "JR", "routeType": 101,
    }]}  # fmt: skip
    assert parse_itinerary(shinkansen, TOKYO, SHINJUKU).summary == "新幹線 はやぶさ18号（往 東京），共 60 分"


# --- typed hotel names get a place --------------------------------------------

import asyncio  # noqa: E402
from types import SimpleNamespace  # noqa: E402

from app.models import DayDraft, TripOutline  # noqa: E402
from app.providers.base import PlacesError  # noqa: E402
from app.trip_builder import locate_lodgings  # noqa: E402

SENDAI = (38.2602, 140.8824)


def _outline() -> TripOutline:
    day = DayDraft.model_construct(date=date(2026, 12, 25), title="", area="仙台", area_lat=SENDAI[0], area_lng=SENDAI[1], stops=[])
    return TripOutline.model_construct(days=[day], theme="snow", summary="")


class FakePlaces:
    def __init__(self, results=None, fail=False):
        self.results, self.fail, self.queries = results or [], fail, []

    async def search(self, query, lat, lng, *, radius_m):
        self.queries.append((query, round(lat, 3), round(lng, 3)))
        if self.fail:
            raise PlacesError("down")
        return self.results


def _providers(places):
    return SimpleNamespace(places=places, country=SimpleNamespace(centre=(36.2, 138.2)))


def _hotel(**kw):
    return LodgingInput(name="三井ガーデンホテル仙台", check_in=date(2026, 12, 25), check_out=date(2026, 12, 27), **kw)


def _place(lat, lng):
    return SimpleNamespace(place_id="ChIJ" + "x" * 20, lat=lat, lng=lng)


def test_typed_hotel_gets_the_place_found_near_that_day():
    places = FakePlaces([_place(38.2635, 140.8722)])
    [hotel] = asyncio.run(locate_lodgings([_hotel()], _outline(), "仙台", _providers(places)))
    assert (hotel.lat, hotel.lng) == (38.2635, 140.8722)
    assert places.queries == [("三井ガーデンホテル仙台 仙台", 38.26, 140.882)]


def test_picked_hotel_is_not_searched_again():
    places = FakePlaces([_place(0, 0)])
    [hotel] = asyncio.run(locate_lodgings([_hotel(lat=38.1, lng=140.1)], _outline(), "仙台", _providers(places)))
    assert (hotel.lat, hotel.lng) == (38.1, 140.1) and places.queries == []


def test_same_name_hotel_far_away_is_ignored():
    places = FakePlaces([_place(35.68, 139.76)])  # Tokyo, not Sendai
    [hotel] = asyncio.run(locate_lodgings([_hotel()], _outline(), "仙台", _providers(places)))
    assert hotel.lat is None


def test_search_failure_keeps_the_typed_name():
    [hotel] = asyncio.run(locate_lodgings([_hotel()], _outline(), "仙台", _providers(FakePlaces(fail=True))))
    assert hotel.lat is None and hotel.name == "三井ガーデンホテル仙台"
