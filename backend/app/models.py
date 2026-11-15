"""Data models for the trip planner.

Three groups, matching who fills them in:

1. TripRequest     — what the user types into the form.
2. TripOutline     — what Claude produces: where to go, in what order, when.
                     Claude never fills weather, opening hours, coordinates or ids.
3. Trip            — the finished itinerary the frontend renders. Built by our
                     code from a confirmed TripOutline plus tool results.
"""

from datetime import date, datetime, time
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

MIN_TRIP_DAYS = 5
MAX_TRIP_DAYS = 8

StopKind = Literal["sight", "meal", "shop"]
MealType = Literal["lunch", "dinner"]


# ---------------------------------------------------------------------------
# 1. User input
# ---------------------------------------------------------------------------


class LodgingInput(BaseModel):
    """A hotel the user has already booked."""

    name: str = Field(min_length=1)
    check_in: date
    check_out: date

    @model_validator(mode="after")
    def check_dates(self) -> Self:
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        return self


class TripRequest(BaseModel):
    destination: str = Field(min_length=1, examples=["青森・函館"])
    start_date: date
    end_date: date
    arrival_time: time | None = Field(None, description="Flight lands on start_date")
    departure_time: time | None = Field(None, description="Flight leaves on end_date")
    travelers: int = Field(ge=1, le=20)
    budget_twd: int | None = Field(None, ge=0)
    preferences: list[str] = Field(default_factory=list, examples=[["溫泉", "美食", "不想太趕"]])
    lodgings: list[LodgingInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_trip_length(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        days = (self.end_date - self.start_date).days + 1
        if not MIN_TRIP_DAYS <= days <= MAX_TRIP_DAYS:
            raise ValueError(f"trip must be {MIN_TRIP_DAYS}–{MAX_TRIP_DAYS} days, got {days}")
        return self


# ---------------------------------------------------------------------------
# 2. Claude's output (the submit_outline tool input)
# ---------------------------------------------------------------------------


class StopDraft(BaseModel):
    name: str = Field(min_length=1)
    kind: StopKind
    meal: MealType | None = Field(None, description="Required when kind is 'meal'")
    place_id: str = Field(min_length=1, description="Must come from a search_place result")
    arrive: time
    stay_min: int = Field(ge=15, le=480)
    note: str = ""

    @model_validator(mode="after")
    def check_meal(self) -> Self:
        if self.kind == "meal" and self.meal is None:
            raise ValueError("a meal stop needs meal = 'lunch' or 'dinner'")
        if self.kind != "meal" and self.meal is not None:
            raise ValueError("only meal stops may set meal")
        return self


class DayDraft(BaseModel):
    date: date
    title: str = Field(min_length=1, examples=["函館 → 青森"])
    area: str = Field(min_length=1, description="Main area of the day, used for weather")
    area_lat: float = Field(ge=-90, le=90)
    area_lng: float = Field(ge=-180, le=180)
    stops: list[StopDraft] = Field(min_length=1)


class TripOutline(BaseModel):
    days: list[DayDraft] = Field(min_length=1)


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
    destination: str
    start_date: date
    end_date: date
    travelers: int
    sample: bool = Field(False, description="True for bundled demo data; hours are illustrative")
    days: list[Day]
