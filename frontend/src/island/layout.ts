// Where things go on each islet. The scenes on an islet follow the real map:
// north is away from the camera (−z), east is to the right (+x). Things that
// would overlap are pushed apart just enough, so the picture stays roughly
// true to geography.
import type { Day } from '../types'
import { seeded } from './random'

export const ISLET_RADIUS = 2
/** Scenes stay inside this radius on their islet. */
const SCENE_RING = ISLET_RADIUS * 0.6
/** Scenes (≈0.8 wide once scaled) closer than this would overlap. */
const SCENE_GAP = 1

type P = [number, number]

/** Flat map coordinates (km-ish), north = −z. */
function project(points: { lat: number; lng: number }[]): P[] {
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / Math.max(points.length, 1)
  const k = Math.cos((lat0 * Math.PI) / 180)
  return points.map((p) => [p.lng * k * 111, -p.lat * 111])
}

/**
 * Push points apart until none are closer than `gap`, while a weak spring
 * keeps each near where the map put it. Optionally keep them inside a circle.
 */
function relax(points: P[], gap: number, seed: string, limit?: number): P[] {
  const rand = seeded(seed)
  // Identical points have no direction to separate in; nudge them a little.
  const home = points.map(([x, z]) => [x + (rand() - 0.5) * 0.01 * gap, z + (rand() - 0.5) * 0.01 * gap] as P)
  const pts = home.map((p) => [...p] as P)
  for (let iter = 0; iter < 240; iter++) {
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
      pts[i][0] += (home[i][0] - pts[i][0]) * 0.02
      pts[i][1] += (home[i][1] - pts[i][1]) * 0.02
      if (limit !== undefined) {
        const r = Math.hypot(pts[i][0], pts[i][1])
        if (r > limit) {
          pts[i][0] *= limit / r
          pts[i][1] *= limit / r
        }
      }
    }
  }
  return pts
}

/** Scene spots on one islet: the day's stops in their real relative positions. */
export function stopSpots(day: Day): P[] {
  const pts = project(day.stops)
  if (pts.length === 1) return [[0, 0]]
  // Centre on the middle of the area covered, and compress distances so one
  // far-off stop doesn't squeeze the rest into a corner.
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const far = Math.max(...pts.map(([x, z]) => Math.hypot(x - cx, z - cz)), 1e-6)
  const scaled = pts.map(([x, z]) => {
    const d = Math.hypot(x - cx, z - cz)
    if (d < 1e-9) return [0, 0] as P
    const r = Math.pow(d / far, 0.55) * SCENE_RING
    return [((x - cx) / d) * r, ((z - cz) / d) * r] as P
  })
  return relax(scaled, sceneGap(pts.length), day.date, SCENE_RING)
}

/** Busy days get smaller scenes so they still fit. */
export function sceneScale(count: number): number {
  return Math.min(1, Math.sqrt(6 / Math.max(count, 1)))
}

function sceneGap(count: number): number {
  return SCENE_GAP * sceneScale(count)
}

/** The open spot farthest from every scene, for the lodging house or the pond. */
export function freeSpot(spots: P[]): P {
  let best: P = [0, 0]
  let bestD = -1
  for (let x = -1.1; x <= 1.1; x += 0.1) {
    for (let z = -1.1; z <= 1.1; z += 0.1) {
      if (Math.hypot(x, z) > 1.15) continue
      const d = Math.min(...spots.map(([sx, sz]) => Math.hypot(sx - x, sz - z)))
      if (d > bestD + 1e-6) {
        bestD = d
        best = [x, z]
      }
    }
  }
  return best
}
