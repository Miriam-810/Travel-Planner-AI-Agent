"""Offline PlaceProvider: knows only the bundled sample trip's places.

Used when no Places key is configured, so POST /api/trips still works with the
sample outline during frontend development.
"""

from dataclasses import dataclass
from datetime import date, time

from app.models import PlaceHours, Trip
from app.providers.base import Place, PlaceNotFound, PlacesError


@dataclass(frozen=True)
class SamplePlace(Place):
    """The sample stores finished hours rather than periods; hand them back as they are."""

    fixed_hours: PlaceHours | None = None

    def hours_on(self, day: date, arrive: time | None = None, stay_min: int = 0, *, today: date) -> PlaceHours | None:
        return self.fixed_hours


class SamplePlaceProvider:
    def __init__(self, sample: Trip):
        self._stops = {s.place_id: s for d in sample.days for s in d.stops}

    async def search(self, query: str, lat: float, lng: float, *, radius_m: int) -> list[Place]:
        raise PlacesError("searching needs a Google Places key")

    async def get(self, place_id: str) -> Place:
        stop = self._stops.get(place_id)
        if stop is None:
            raise PlaceNotFound(place_id)
        return SamplePlace(
            place_id=place_id,
            name=stop.name,
            address="",
            lat=stop.lat,
            lng=stop.lng,
            business_status=stop.hours.business_status if stop.hours else "OPERATIONAL",
            maps_url=stop.maps_url,
            rating=None,
            rating_count=None,
            regular_periods=None,
            fixed_hours=stop.hours,
        )
