// The trip as a 3D board map: the real coastline around the trip (Natural
// Earth 1:10m, see scripts/build-coast.mjs), with every stop at its real
// position, north away from the camera (−z) and east to the right (+x).
//
// A whole trip can span 200 km while one day's stops sit within 2 km, so each
// day gets its own scene size: small enough that its stops don't overlap
// when the camera zooms into that day.
import type { Day } from '../types'
import landData from './japan-land.json'
import { seeded } from './random'

export type P = [number, number]

/** Long side of the trip's own extent, in scene units. */
const TRIP_SIZE = 30
export const KM_PER_DEG = 111.32

export interface DayLayout {
  /** Scene position of each stop, in visiting order (nudged apart if they would overlap). */
  stops: P[]
  /** Scene-unit size of one stop's little scene on this day. */
  piece: number
  /**
   * Middle and half-size of the day's main group of stops, for the camera and
   * the flag. A Miyajima day that starts at Hiroshima Station and ends with
   * dinner back in town is "about" Miyajima, not the 20 km in between.
   */
  centre: P
  half: P
}

/** Stops closer than this (km) to another stop in the group belong to the same group. */
const GROUP_KM = 3

/** Indices of the largest group of stops, linking any two within `gap` of each other. */
function mainGroup(points: P[], gap: number): number[] {
  const group = points.map((_, i) => i)
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])))
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      if (Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) <= gap) group[find(i)] = find(j)
  const members = new Map<number, number[]>()
  points.forEach((_, i) => members.set(find(i), [...(members.get(find(i)) ?? []), i]))
  // Largest group; on a tie, the one visited first.
  return [...members.values()].sort((a, b) => b.length - a.length || a[0] - b[0])[0] ?? []
}

/** How the map turns lng/lat into scene units, so other layers (terrain) line up. */
export interface Frame {
  lng0: number
  lat0: number
  /** cos(lat0): east–west km per degree shrink with latitude. */
  k: number
  /** Scene units per km. */
  unit: number
  box: GeoBox
}

export interface TripMap {
  /** Map rectangle in scene units, centred on 0. */
  width: number
  depth: number
  frame: Frame
  /** Coastline rings clipped to the map, in scene units (x, z). */
  land: P[][]
  days: DayLayout[]
  /** Middle and half-size of all the stops, for the overview camera. */
  centre: P
  half: P
}

export interface GeoBox {
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

function bounds(points: P[]): { centre: P; half: P } {
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  return {
    centre: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2],
    half: [(Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...zs) - Math.min(...zs)) / 2],
  }
}

/** Push points apart until none are closer than `gap`, with a pull back towards where they really are. */
function relax(home: P[], gap: number, seed: string): P[] {
  const rand = seeded(seed)
  const pts = home.map(([x, z]) => [x + (rand() - 0.5) * gap * 0.01, z + (rand() - 0.5) * gap * 0.01] as P)
  for (let iter = 0; iter < 200; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j][0] - pts[i][0]
        const dz = pts[j][1] - pts[i][1]
        const d = Math.hypot(dx, dz) || 1e-9
        if (d >= gap) continue
        const push = (gap - d) / 2
        pts[i][0] -= (dx / d) * push
        pts[i][1] -= (dz / d) * push
        pts[j][0] += (dx / d) * push
        pts[j][1] += (dz / d) * push
      }
    }
    for (let i = 0; i < pts.length; i++) {
      pts[i][0] += (home[i][0] - pts[i][0]) * 0.05
      pts[i][1] += (home[i][1] - pts[i][1]) * 0.05
    }
  }
  return pts
}

/**
 * @param aspect width / height of the view, so the map can widen (or deepen)
 * to fill it with more of the real surroundings.
 */
export function buildTripMap(days: Day[], seed: string, aspect = 1.6, minHalfKm = 3): TripMap {
  const all = days.flatMap((d) => d.stops)
  const lats = all.map((s) => s.lat)
  const lngs = all.map((s) => s.lng)
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2
  const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const k = Math.cos((lat0 * Math.PI) / 180)

  // The trip's own extent (km, at least minHalfKm each way) sets the scale.
  const tripX = Math.max(((Math.max(...lngs) - Math.min(...lngs)) / 2) * k * KM_PER_DEG, minHalfKm)
  const tripZ = Math.max(((Math.max(...lats) - Math.min(...lats)) / 2) * KM_PER_DEG, minHalfKm)
  const unit = TRIP_SIZE / (2 * Math.max(tripX, tripZ)) // scene units per km

  // The map reaches well past the trip, and past the edges of the view.
  const groundAspect = aspect / 0.8
  let halfX = Math.max(tripX * 2.2, tripZ * 2.2 * groundAspect, 12 / unit)
  const halfZ = Math.max(tripZ * 2.2, halfX / groundAspect, 12 / unit)
  halfX = Math.max(halfX, halfZ * groundAspect)

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

  const dayLayouts = days.map((d, i): DayLayout => {
    const real = d.stops.map((s) => toScene(s.lng, s.lat))
    const main = mainGroup(real, GROUP_KM * unit)
    const focus = main.map((k) => real[k])
    const b = bounds(focus.length ? focus : [[0, 0]])
    // Scene size: roughly the main group's spread shared among its stops, within sensible limits.
    const spread = Math.max(b.half[0], b.half[1]) * 2
    const piece = Math.min(1.1, Math.max(0.18, spread / (Math.sqrt(Math.max(focus.length, 1)) * 1.6)))
    const stops = relax(real, piece * 1.35, `${seed}-${i}`)
    return { stops, piece, ...bounds(main.length ? main.map((k) => stops[k]) : [[0, 0]]) }
  })

  return {
    width: 2 * halfX * unit,
    depth: 2 * halfZ * unit,
    frame: { lng0, lat0, k, unit, box },
    land,
    days: dayLayouts,
    ...bounds(dayLayouts.flatMap((d) => d.stops)),
  }
}

/** Ray-casting point-in-polygon, for scattering trees on land. */
export function onLand(x: number, z: number, land: P[][]): boolean {
  let inside = false
  for (const ring of land) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i]
      const [xj, zj] = ring[j]
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
    }
  }
  return inside
}

/** Scene position (x, z) of a place. */
export function toScene(frame: Frame, lng: number, lat: number): P {
  return [(lng - frame.lng0) * frame.k * KM_PER_DEG * frame.unit, -(lat - frame.lat0) * KM_PER_DEG * frame.unit]
}
