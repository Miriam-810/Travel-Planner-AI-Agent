// The whole country as one soft, rounded board: the real coastline (Natural
// Earth), simplified and smoothed so it reads like a toy map rather than a
// survey, with a spot for every trip. Same shape as a TripMap, so the trip
// map's trees, flags and camera work on it unchanged.
import { clipRing, KM_PER_DEG, landRings, onLand, type GeoBox, type P, type TripMap } from './tripMap'

/** Long side of the country board, in scene units. */
const COUNTRY_SIZE = 40
/** Islands smaller than this (km²) are left out: specks only add noise at this scale. */
const MIN_ISLAND_KM2 = 150
/** Japan from Kyushu to Hokkaido; widened to take in every trip (Okinawa, say). */
const JAPAN: GeoBox = { west: 129.2, east: 146.2, south: 30.8, north: 45.7 }
/** Points on the neighbours' coasts (Korea, Russia's Primorye, Sakhalin): their land stays off this map. */
const NEIGHBOURS: P[] = [
  [127.0, 37.5],
  [133.0, 44.5],
  [142.8, 46.3],
]

function areaOf(ring: P[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return Math.abs(a) / 2
}

/** Douglas–Peucker: drop points that sit within `tol` of the line through their neighbours. */
function simplify(pts: P[], tol: number): P[] {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, az] = pts[a]
    const [bx, bz] = pts[b]
    const len = Math.hypot(bx - ax, bz - az) || 1e-9
    let worst = -1
    let far = 0
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / len
      if (d > far) {
        far = d
        worst = i
      }
    }
    if (far > tol && worst > 0) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** Chaikin corner cutting on a closed ring: every pass rounds the corners a little more. */
function smooth(ring: P[], passes: number): P[] {
  let r = ring
  for (let p = 0; p < passes; p++) {
    const out: P[] = []
    for (let i = 0; i < r.length; i++) {
      const a = r[i]
      const b = r[(i + 1) % r.length]
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    r = out
  }
  return r
}

/** One spot per trip, at its centre (lng, lat). */
export function buildCountryMap(points: { lat: number; lng: number }[], aspect = 1.6): TripMap {
  const pad = 0.6
  const box: GeoBox = {
    west: Math.min(JAPAN.west, ...points.map((p) => p.lng - pad)),
    east: Math.max(JAPAN.east, ...points.map((p) => p.lng + pad)),
    south: Math.min(JAPAN.south, ...points.map((p) => p.lat - pad)),
    north: Math.max(JAPAN.north, ...points.map((p) => p.lat + pad)),
  }
  const lng0 = (box.west + box.east) / 2
  const lat0 = (box.south + box.north) / 2
  const k = Math.cos((lat0 * Math.PI) / 180)
  const halfXkm = ((box.east - box.west) / 2) * k * KM_PER_DEG
  const halfZkm = ((box.north - box.south) / 2) * KM_PER_DEG
  const unit = COUNTRY_SIZE / (2 * Math.max(halfXkm, halfZkm))
  const toScene = (lng: number, lat: number): P => [(lng - lng0) * k * KM_PER_DEG * unit, -(lat - lat0) * KM_PER_DEG * unit]
  const minArea = MIN_ISLAND_KM2 * unit * unit

  const land: P[][] = []
  for (const r of landRings()) {
    if (r.east < box.west || r.west > box.east || r.north < box.south || r.south > box.north) continue
    if (NEIGHBOURS.some(([x, y]) => onLand(x, y, [r.pts]))) continue
    const clipped = clipRing(r.pts, box)
    if (clipped.length < 3) continue
    const ring = clipped.map(([lng, lat]) => toScene(lng, lat))
    if (areaOf(ring) < minArea) continue
    // A closed ring starts and ends on the same point: simplify it as two open halves.
    const mid = ring.length >> 1
    const simple = [...simplify(ring.slice(0, mid + 1), 0.06).slice(0, -1), ...simplify([...ring.slice(mid), ring[0]], 0.06).slice(0, -1)]
    if (simple.length >= 3) land.push(smooth(simple, 2))
  }

  const spots = points.map((p) => toScene(p.lng, p.lat))
  // Frame the land and every trip (a marker stands a little above its spot: leave room behind it).
  const framed = [...land.flat(), ...spots.flatMap(([x, z]): P[] => [[x, z - 1.2], [x, z + 2.6]])]
  const xs = framed.map((p) => p[0])
  const zs = framed.map((p) => p[1])
  const centre: P = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
  const half: P = [(Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...zs) - Math.min(...zs)) / 2]
  const groundAspect = aspect / 0.8
  const width = Math.max(half[0] * 2, half[1] * 2 * groundAspect) + 8
  const depth = Math.max(half[1] * 2, width / groundAspect)

  return {
    width,
    depth,
    frame: { lng0, lat0, k, unit, box },
    land,
    days: spots.map((s) => ({ stops: [s], piece: 0.6, centre: s, half: [0, 0] as P })),
    centre,
    half,
  }
}
