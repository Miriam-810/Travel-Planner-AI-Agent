// The real-world base under the trip island: the coastline around the trip
// (Natural Earth 1:10m, see scripts/build-coast.mjs), projected to scene units
// with north away from the camera (−z) and east to the right (+x).
//
// Each day's islet floats above where the day really happens. When several
// days share a city, the islets move apart, but a dashed line still drops to
// the true spot on the map.
import type { Day } from '../types'
import landData from './japan-land.json'
import { ISLET_RADIUS } from './layout'
import { seeded } from './random'

type P = [number, number]

/** Height of the floating islets above the map. */
export const ISLET_HEIGHT = 3.4
/** Islets closer than this would touch. */
const ISLET_GAP = ISLET_RADIUS * 2 + 0.8
const KM_PER_DEG = 111.32

export interface TripMap {
  /** Map rectangle in scene units, centred on 0. */
  width: number
  depth: number
  /** Coastline rings clipped to the map, in scene units (x, z). */
  land: P[][]
  /** Where each day really happens, on the map. */
  ground: P[]
  /** Where each day's islet floats (x, y, z). */
  islets: [number, number, number][]
}

interface GeoBox {
  west: number
  east: number
  south: number
  north: number
}

function clipEdge(ring: P[], inside: (p: P) => boolean, cross: (a: P, b: P) => P): P[] {
  const out: P[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const ia = inside(a)
    const ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib) out.push(cross(a, b))
  }
  return out
}

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Clip a lng/lat ring to a box (Sutherland–Hodgman, one edge at a time). */
function clipRing(ring: P[], box: GeoBox): P[] {
  let r = clipEdge(ring, (p) => p[0] >= box.west, (a, b) => lerp(a, b, (box.west - a[0]) / (b[0] - a[0])))
  if (r.length) r = clipEdge(r, (p) => p[0] <= box.east, (a, b) => lerp(a, b, (box.east - a[0]) / (b[0] - a[0])))
  if (r.length) r = clipEdge(r, (p) => p[1] >= box.south, (a, b) => lerp(a, b, (box.south - a[1]) / (b[1] - a[1])))
  if (r.length) r = clipEdge(r, (p) => p[1] <= box.north, (a, b) => lerp(a, b, (box.north - a[1]) / (b[1] - a[1])))
  return r
}

let rings: { pts: P[]; west: number; east: number; south: number; north: number }[] | null = null

function landRings() {
  rings ??= (landData as number[][]).map((flat) => {
    const pts: P[] = []
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] / 1000, flat[i + 1] / 1000])
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    return { pts, west: Math.min(...xs), east: Math.max(...xs), south: Math.min(...ys), north: Math.max(...ys) }
  })
  return rings
}

/** Push islets apart until none touch, with a weak pull back towards their true spot. */
function relax(home: P[], gap: number, seed: string): P[] {
  const rand = seeded(seed)
  const pts = home.map(([x, z]) => [x + (rand() - 0.5) * 0.02, z + (rand() - 0.5) * 0.02] as P)
  for (let iter = 0; iter < 300; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j][0] - pts[i][0]
        const dz = pts[j][1] - pts[i][1]
        const d = Math.hypot(dx, dz) || 1e-6
        if (d >= gap) continue
        const push = (gap - d) / 2
        pts[i][0] -= (dx / d) * push
        pts[i][1] -= (dz / d) * push
        pts[j][0] += (dx / d) * push
        pts[j][1] += (dz / d) * push
      }
    }
    for (let i = 0; i < pts.length; i++) {
      pts[i][0] += (home[i][0] - pts[i][0]) * 0.03
      pts[i][1] += (home[i][1] - pts[i][1]) * 0.03
    }
  }
  return pts
}

/**
 * @param aspect width / height of the view, so the map can widen (or deepen)
 * to fill it with more of the real surroundings.
 */
export function buildTripMap(days: Day[], seed: string, aspect = 1.6): TripMap {
  const stops = days.flatMap((d) => d.stops)
  const lats = stops.map((s) => s.lat)
  const lngs = stops.map((s) => s.lng)
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2
  const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const k = Math.cos((lat0 * Math.PI) / 180)

  // The trip's own extent (km) sets the scale, so the islets stay large in view.
  // Busier trips get a little more room so their islets can spread out.
  const tripX = Math.max(((Math.max(...lngs) - Math.min(...lngs)) / 2) * k * KM_PER_DEG, 8)
  const tripZ = Math.max(((Math.max(...lats) - Math.min(...lats)) / 2) * KM_PER_DEG, 8)
  const want = Math.max(11, ISLET_GAP * Math.sqrt(days.length) * 1.25)
  const unit = want / (2 * Math.max(tripX, tripZ)) // scene units per km

  // The map reaches well past the trip on every side, and past the edges of
  // the view, so the real surroundings fill the picture.
  const groundAspect = aspect / 0.8
  let halfX = Math.max(tripX * 2.4, tripZ * 2.4 * groundAspect, 40 / unit)
  let halfZ = Math.max(tripZ * 2.4, halfX / groundAspect)
  halfX = Math.max(halfX, halfZ * groundAspect)
  const width = 2 * halfX * unit
  const depth = 2 * halfZ * unit

  const toScene = (lng: number, lat: number): P => [(lng - lng0) * k * KM_PER_DEG * unit, -(lat - lat0) * KM_PER_DEG * unit]

  const box: GeoBox = {
    west: lng0 - halfX / (k * KM_PER_DEG),
    east: lng0 + halfX / (k * KM_PER_DEG),
    south: lat0 - halfZ / KM_PER_DEG,
    north: lat0 + halfZ / KM_PER_DEG,
  }
  const land: P[][] = []
  for (const r of landRings()) {
    if (r.east < box.west || r.west > box.east || r.north < box.south || r.south > box.north) continue
    const clipped = clipRing(r.pts, box)
    if (clipped.length >= 3) land.push(clipped.map(([lng, lat]) => toScene(lng, lat)))
  }

  const ground = days.map((d) => {
    const n = Math.max(d.stops.length, 1)
    return toScene(d.stops.reduce((s, x) => s + x.lng, 0) / n, d.stops.reduce((s, x) => s + x.lat, 0) / n)
  })
  const islets = relax(ground, ISLET_GAP, seed).map(([x, z]) => [x, ISLET_HEIGHT, z] as [number, number, number])

  return { width, depth, land, ground, islets }
}
