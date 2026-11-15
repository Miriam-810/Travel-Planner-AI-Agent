// Is this point on land? Natural Earth's 1:110m land outline (public domain,
// via the world-atlas package), tested in plain lng/lat: plenty for colouring
// the faces of a low-poly globe.
import type { MultiPolygon, Position } from 'geojson'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import land110m from 'world-atlas/land-110m.json'

interface Shape {
  rings: Position[][]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

let shapes: Shape[] | null = null

function load(): Shape[] {
  const topo = land110m as unknown as Topology<{ land: GeometryCollection }>
  const fc = feature(topo, topo.objects.land)
  const geom = fc.features[0].geometry as MultiPolygon
  return geom.coordinates.map((rings) => {
    const xs = rings[0].map((p) => p[0])
    const ys = rings[0].map((p) => p[1])
    return { rings, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  })
}

function inRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function isLand(lat: number, lng: number): boolean {
  if (lat < -80) return true // Antarctica's outline stops short of the pole
  shapes ??= load()
  for (const s of shapes) {
    if (lng < s.minX || lng > s.maxX || lat < s.minY || lat > s.maxY) continue
    if (inRing(lng, lat, s.rings[0]) && !s.rings.slice(1).some((hole) => inRing(lng, lat, hole))) return true
  }
  return false
}
