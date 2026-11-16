// Turning a finished trip back into something editable, and spotting what a
// revision changed.
import type { LodgingInput, Trip, TripOutline, TripRequest } from '../types'

/** The outline a trip was built from: same stops, same times. */
export function outlineFromTrip(trip: Trip): TripOutline {
  return {
    theme: trip.theme,
    days: trip.days.map((d) => {
      const n = Math.max(d.stops.length, 1)
      return {
        date: d.date,
        title: d.title,
        area: d.area,
        // The finished trip doesn't keep the day's centre; the stops' average is close enough for the weather.
        area_lat: d.stops.reduce((s, x) => s + x.lat, 0) / n,
        area_lng: d.stops.reduce((s, x) => s + x.lng, 0) / n,
        stops: d.stops.map((s) => ({
          name: s.name,
          kind: s.kind,
          scene: s.scene,
          meal: s.meal,
          place_id: s.place_id,
          arrive: s.arrive.slice(0, 5),
          stay_min: s.stay_min,
          note: s.note,
        })),
      }
    }),
  }
}

/**
 * For trips saved before requests were kept with them: rebuild what we can.
 * Flight times, budget and preferences are unknown; lodgings come from each night's hotel.
 */
export function requestFromTrip(trip: Trip): TripRequest {
  const lodgings: LodgingInput[] = []
  for (const day of trip.days) {
    if (!day.lodging) continue
    const next = nextDate(day.date)
    const last = lodgings.at(-1)
    if (last && last.name === day.lodging && last.check_out === day.date) last.check_out = next
    else lodgings.push({ name: day.lodging, check_in: day.date, check_out: next })
  }
  return {
    country: trip.country,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    arrival_time: null,
    departure_time: null,
    travelers: trip.travelers,
    budget_twd: null,
    preferences: [],
    lodgings,
  }
}

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Key for "this place, on this day, at this time". */
export function stopKey(date: string, placeId: string, arrive: string): string {
  return `${date}|${placeId}|${arrive.slice(0, 5)}`
}

/** Stops in `next` that weren't in `prev` at the same day and time: what a revision changed. */
export function changedStops(prev: TripOutline, next: TripOutline): string[] {
  const before = new Set(prev.days.flatMap((d) => d.stops.map((s) => stopKey(d.date, s.place_id, s.arrive))))
  return next.days.flatMap((d) => d.stops.map((s) => stopKey(d.date, s.place_id, s.arrive)).filter((k) => !before.has(k)))
}
