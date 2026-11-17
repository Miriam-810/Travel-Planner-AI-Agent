"""Data models for the trip planner.

Three groups, matching who fills them in:

1. TripRequest     — what the user types into the form.
2. TripOutline     — what Claude produces: where to go, in what order, when.
                     Claude never fills weather, opening hours, coordinates or ids.
3. Trip            — the finished itinerary the frontend renders. Built by our
                     code from a confirmed TripOutline plus tool results.
"""

from datetime import date, datetime, time
from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

MIN_TRIP_DAYS = 1
MAX_TRIP_DAYS = 10

# Limits on everything a client can send. Free text goes into Claude's prompt on
# every turn, and every stop costs a Google Places call, so nothing is unbounded.
MAX_STOPS_PER_DAY = 12
MAX_PREFERENCES = 10
MAX_LODGINGS = 10

# Google place ids are URL-safe base64-ish strings. Anything else is rejected
# before it can be put into a Places URL (e.g. "../places:searchNearby").
PLACE_ID_PATTERN = r"^[A-Za-z0-9_-]{1,300}$"

Preference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]

StopKind = Literal["sight", "meal", "shop"]

# Colour palette for the outline and trip pages, picked by Claude from the
# destination, season and weather. The palettes themselves live in the frontend.
SceneKind = Literal[
    "ramen", "seafood", "cafe", "restaurant",
    "shrine", "temple", "castle", "onsen", "museum", "park", "nature", "viewpoint", "beach", "street",
    "market", "shop", "station", "landmark",
]
"""What the stop looks like on the trip island. Picked by Claude; old outlines without it get 'landmark'."""
TripTheme = Literal["sage", "snow", "maple", "sakura", "ocean", "summer", "city"]
MealType = Literal["lunch", "dinner"]


# ---------------------------------------------------------------------------
# 1. User input
# ---------------------------------------------------------------------------


class LodgingInput(BaseModel):
    """A hotel the user has already booked."""

    name: str = Field(min_length=1, max_length=100)
    check_in: date
    check_out: date
    # Where it is, when the traveller picked it from a search (POST /api/hotels).
    place_id: str | None = Field(None, pattern=PLACE_ID_PATTERN)
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)

    @model_validator(mode="after")
    def check_dates(self) -> Self:
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        return self


# ISO 3166-1 alpha-2. Which codes are supported is decided by the provider
# registry (app/providers/registry.py), not here, so adding a country needs no
# model change.
CountryCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]


class TripRequest(BaseModel):
    country: CountryCode = Field("JP", examples=["JP"])
    destination: str = Field(min_length=1, max_length=50, examples=["青森・函館"])
    start_date: date
    end_date: date
    arrival_time: time | None = Field(None, description="Flight lands on start_date")
    departure_time: time | None = Field(None, description="Flight leaves on end_date")
    travelers: int = Field(ge=1, le=20)
    budget_twd: int | None = Field(None, ge=0, le=1_000_000)
    preferences: list[Preference] = Field(
        default_factory=list, max_length=MAX_PREFERENCES, examples=[["溫泉", "美食", "不想太趕"]]
    )
    lodgings: list[LodgingInput] = Field(default_factory=list, max_length=MAX_LODGINGS)

    @model_validator(mode="after")
    def check_trip_length(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        days = (self.end_date - self.start_date).days + 1
        if not MIN_TRIP_DAYS <= days <= MAX_TRIP_DAYS:
            raise ValueError(f"trip must be {MIN_TRIP_DAYS}–{MAX_TRIP_DAYS} days, got {days}")
        if days == 1 and self.arrival_time and self.departure_time and self.arrival_time >= self.departure_time:
            raise ValueError("on a one-day trip the arrival must be before the departure")
        for lodging in self.lodgings:
            if lodging.check_in < self.start_date or lodging.check_out > self.end_date:
                raise ValueError(f"lodging {lodging.name!r} must be within the trip ({self.start_date} to {self.end_date})")
        nights = sorted(self.lodgings, key=lambda l: l.check_in)
        for a, b in zip(nights, nights[1:]):
            if b.check_in < a.check_out:
                raise ValueError(f"lodgings {a.name!r} and {b.name!r} overlap")
        return self


# ---------------------------------------------------------------------------
# 2. Claude's output (the submit_outline tool input)
# ---------------------------------------------------------------------------


class StopDraft(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: StopKind
    scene: SceneKind = "landmark"
    meal: MealType | None = Field(None, description="Required when kind is 'meal'")
    place_id: str = Field(pattern=PLACE_ID_PATTERN, description="Must come from a search_place result")
    arrive: time
    stay_min: int = Field(ge=15, le=480)
    note: str = Field("", max_length=200)

    @model_validator(mode="after")
    def check_meal(self) -> Self:
        if self.kind == "meal" and self.meal is None:
            raise ValueError("a meal stop needs meal = 'lunch' or 'dinner'")
        if self.kind != "meal" and self.meal is not None:
            raise ValueError("only meal stops may set meal")
        return self


class DayDraft(BaseModel):
    date: date
    title: str = Field(min_length=1, max_length=60, examples=["函館 → 青森"])
    area: str = Field(min_length=1, max_length=60, description="Main area of the day, used for weather")
    area_lat: float = Field(ge=-90, le=90)
    area_lng: float = Field(ge=-180, le=180)
    stops: list[StopDraft] = Field(min_length=1, max_length=MAX_STOPS_PER_DAY)


class TripOutline(BaseModel):
    theme: TripTheme = "sage"
    days: list[DayDraft] = Field(min_length=1, max_length=MAX_TRIP_DAYS)


MAX_CHAT_MESSAGE = 500
MAX_CHAT_HISTORY = 10


class ChatTurn(BaseModel):
    """One earlier message in the revision chat, so "再改一次" has context."""

    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=1000)


class Revision(BaseModel):
    """A change the traveller asked for, in their own words, to an outline they already have."""

    outline: TripOutline
    message: str = Field(min_length=1, max_length=MAX_CHAT_MESSAGE)
    history: list[ChatTurn] = Field(default_factory=list, max_length=MAX_CHAT_HISTORY)


# ---------------------------------------------------------------------------
# 3. Finished itinerary (filled by our code, rendered by the frontend)
# ---------------------------------------------------------------------------


class Weather(BaseModel):
    source: Literal["forecast", "climate_avg"]
    high_c: float
    low_c: float
    precip_mm: float | None = None
    summary: str = Field(examples=["雪"])


class PlaceHours(BaseModel):
    """Opening hours for one stop on its planned date, from Google Places."""

    source: Literal["google_places"] = "google_places"
    today_text: str | None = Field(
        None, description="Hours on the planned date, e.g. '11:00–14:30, 17:00–21:00'; None if Google has no hours"
    )
    open_at_arrive: bool | None = Field(
        None, description="Open for the whole planned stay; None when there is no hours data"
    )
    business_status: str = Field(examples=["OPERATIONAL"])
    checked_at: datetime


class Stop(StopDraft):
    id: str = Field(examples=["d3-s1"])
    lat: float
    lng: float
    maps_url: str | None = None
    hours: PlaceHours | None = None


class Day(BaseModel):
    date: date
    title: str
    area: str
    weather: Weather | None = None
    lodging: str | None = None
    stops: list[Stop]
    warnings: list[str] = Field(default_factory=list)


class Trip(BaseModel):
    id: str
    country: CountryCode = "JP"
    theme: TripTheme = "sage"
    destination: str
    start_date: date
    end_date: date
    travelers: int
    sample: bool = Field(False, description="True for bundled demo data; hours are illustrative")
    days: list[Day]
