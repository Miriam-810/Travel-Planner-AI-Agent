// Every trip this device has planned. Until there are accounts, the device is
// the user: trips live in localStorage, and a first sign-in can upload them.
import type { Trip } from '../types'
import { load, save } from './storage'

const KEY = 'tp.trips'

export interface SavedTrip {
  trip: Trip
  savedAt: string
}

/** 'planned': the trip is still ahead (or under way). 'built': it ended. */
export type TripStatus = 'planned' | 'built'

export function loadLibrary(): SavedTrip[] {
  const list = load<SavedTrip[]>(KEY)
  return Array.isArray(list) ? list.filter((e) => e?.trip?.id && Array.isArray(e.trip.days)) : []
}

/** Adds the trip, or replaces the saved one with the same id. Newest first. */
export function withTrip(list: SavedTrip[], trip: Trip): SavedTrip[] {
  return [{ trip, savedAt: new Date().toISOString() }, ...list.filter((e) => e.trip.id !== trip.id)]
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
