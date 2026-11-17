// Every trip this device has planned. Until there are accounts, the device is
// the user: trips live in localStorage, and a first sign-in can upload them.
import type { Trip, TripRequest } from '../types'
import { load, save } from './storage'

const KEY = 'tp.trips'

export interface SavedTrip {
  trip: Trip
  /** The form answers the trip was planned from, so it can be edited later. Missing on early saves. */
  request?: TripRequest
  savedAt: string
  /**
   * Set by hand ("標記為已經去過" / "其實還沒去") when the dates alone get it
   * wrong: a trip postponed, or an old trip added after the fact.
   */
  status?: TripStatus
}

/** 'planned': the trip is still ahead (or under way). 'built': it ended. */
export type TripStatus = 'planned' | 'built'

export function loadLibrary(): SavedTrip[] {
  const list = load<SavedTrip[]>(KEY)
  return Array.isArray(list) ? list.filter((e) => e?.trip?.id && Array.isArray(e.trip.days)) : []
}

/**
 * Adds the trip, or replaces the saved one with the same id (or `replaces`,
 * when an edit rebuilt it under a new id). Newest first.
 */
export function withTrip(list: SavedTrip[], trip: Trip, request?: TripRequest, replaces?: string): SavedTrip[] {
  const old = list.find((e) => e.trip.id === trip.id || e.trip.id === replaces)
  const entry = { trip, request: request ?? old?.request, savedAt: new Date().toISOString() }
  return [entry, ...list.filter((e) => e.trip.id !== trip.id && e.trip.id !== replaces)]
}

export function withoutTrip(list: SavedTrip[], id: string): SavedTrip[] {
  return list.filter((e) => e.trip.id !== id)
}

export function storeLibrary(list: SavedTrip[]): void {
  save(KEY, list)
}

/** Today on this device, "YYYY-MM-DD". */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** A saved trip's state: what the traveller set by hand, otherwise what the dates say. */
export function statusOf(entry: SavedTrip): TripStatus {
  return entry.status ?? tripStatus(entry.trip)
}

/** Set a trip's state by hand; setting it back to what the dates say clears the override. */
export function withStatus(list: SavedTrip[], id: string, status: TripStatus): SavedTrip[] {
  return list.map((e) => (e.trip.id === id ? { ...e, status: status === tripStatus(e.trip) ? undefined : status } : e))
}

/** A trip is built once its last day is over on this device's calendar. */
export function tripStatus(trip: Trip, today = localToday()): TripStatus {
  return trip.end_date < today ? 'built' : 'planned'
}

/** Middle of every stop on the trip, for its place on the globe. */
export function tripCentre(trip: Trip): { lat: number; lng: number } | null {
  const stops = trip.days.flatMap((d) => d.stops)
  if (stops.length === 0) return null
  return {
    lat: stops.reduce((s, x) => s + x.lat, 0) / stops.length,
    lng: stops.reduce((s, x) => s + x.lng, 0) / stops.length,
  }
}
