// Well-known places that get a landmark on the trip map (and on the globe's
// trip island) when the trip spends a day nearby. Matched by coordinates, so
// the destination's wording (京都, Kyoto, 京都市) doesn't matter.
import type { Trip } from '../types'

export type LandmarkKind =
  | 'tower'
  | 'pagoda'
  | 'castle'
  | 'goldCastle'
  | 'greatHall'
  | 'clockTower'
  | 'starFort'
  | 'nebuta'
  | 'gardenLantern'
  | 'fuji'
  | 'buddha'
  | 'seaTorii'
  | 'harbourTower'
  | 'shisa'

export interface City {
  name: string
  /** Where the landmark itself stands. */
  lat: number
  lng: number
  /** Stops within this distance count as being in the city. */
  radiusKm: number
  landmark: LandmarkKind
  /** How big the landmark is drawn on the trip map, relative to the others. */
  size?: number
}

export const CITIES: City[] = [
  { name: '東京', lat: 35.6586, lng: 139.7454, radiusKm: 25, landmark: 'tower' },
  { name: '京都', lat: 34.9985, lng: 135.7808, radiusKm: 15, landmark: 'pagoda' },
  { name: '大阪', lat: 34.6873, lng: 135.5262, radiusKm: 18, landmark: 'castle' },
  { name: '奈良', lat: 34.689, lng: 135.8398, radiusKm: 10, landmark: 'greatHall' },
  { name: '名古屋', lat: 35.1856, lng: 136.8991, radiusKm: 20, landmark: 'goldCastle' },
  { name: '札幌', lat: 43.0626, lng: 141.3536, radiusKm: 20, landmark: 'clockTower' },
  { name: '函館', lat: 41.7969, lng: 140.757, radiusKm: 15, landmark: 'starFort' },
  { name: '青森', lat: 40.8285, lng: 140.7346, radiusKm: 15, landmark: 'nebuta' },
  { name: '弘前', lat: 40.6075, lng: 140.4637, radiusKm: 8, landmark: 'castle' },
  { name: '金澤', lat: 36.5621, lng: 136.6626, radiusKm: 10, landmark: 'gardenLantern' },
  { name: '富士山', lat: 35.3606, lng: 138.7274, radiusKm: 40, landmark: 'fuji', size: 2.2 },
  { name: '鎌倉', lat: 35.3167, lng: 139.5358, radiusKm: 6, landmark: 'buddha' },
  { name: '廣島・宮島', lat: 34.2959, lng: 132.3199, radiusKm: 25, landmark: 'seaTorii' },
  { name: '福岡', lat: 33.5933, lng: 130.3515, radiusKm: 20, landmark: 'harbourTower' },
  { name: '沖繩', lat: 26.217, lng: 127.7195, radiusKm: 30, landmark: 'shisa' },
]

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * 111.32
  const dLng = (bLng - aLng) * 111.32 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

function stopsWithin(trip: Trip, c: City): number {
  return trip.days.reduce((n, d) => n + d.stops.filter((s) => km(s.lat, s.lng, c.lat, c.lng) <= c.radiusKm).length, 0)
}

/**
 * Cities the trip really spends time in: at least two stops nearby (one stop
 * could be just an airport or a station on the way through).
 */
export function citiesOnTrip(trip: Trip): City[] {
  return CITIES.filter((c) => stopsWithin(trip, c) >= 2)
}

/** The city with the most of the trip's stops, for its island on the globe. */
export function mainCity(trip: Trip): City | null {
  let best: City | null = null
  let bestStops = 1
  for (const c of CITIES) {
    const n = stopsWithin(trip, c)
    if (n > bestStops) {
      best = c
      bestStops = n
    }
  }
  return best
}
