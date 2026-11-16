// Builds src/island/japan-land.json: Natural Earth 1:10m land (public domain,
// via the world-atlas package) clipped to Japan and its neighbours, simplified
// to ~300 m and stored as integer micro-degrees /1000 to keep the file small.
// Run: node scripts/build-coast.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { feature } from 'topojson-client'

const BOX = { west: 122, east: 154, south: 20, north: 46.5 }
const TOLERANCE = 0.003 // degrees, ~300 m

const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/land-10m.json', import.meta.url)))
const land = feature(topo, topo.objects.land).features[0].geometry

/** Sutherland–Hodgman against one edge of the box. */
function clipEdge(ring, inside, cross) {
  const out = []
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
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
function clip(ring) {
  let r = ring
  r = clipEdge(r, (p) => p[0] >= BOX.west, (a, b) => lerp(a, b, (BOX.west - a[0]) / (b[0] - a[0])))
  if (r.length) r = clipEdge(r, (p) => p[0] <= BOX.east, (a, b) => lerp(a, b, (BOX.east - a[0]) / (b[0] - a[0])))
  if (r.length) r = clipEdge(r, (p) => p[1] >= BOX.south, (a, b) => lerp(a, b, (BOX.south - a[1]) / (b[1] - a[1])))
  if (r.length) r = clipEdge(r, (p) => p[1] <= BOX.north, (a, b) => lerp(a, b, (BOX.north - a[1]) / (b[1] - a[1])))
  return r
}

/** Douglas–Peucker. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    const [ax, ay] = pts[s]
    const [bx, by] = pts[e]
    const len = Math.hypot(bx - ax, by - ay) || 1e-12
    let best = -1
    let bestD = tol
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len
      if (d > bestD) {
        bestD = d
        best = i
      }
    }
    if (best > 0) {
      keep[best] = 1
      stack.push([s, best], [best, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

const rings = []
for (const polygon of land.coordinates) {
  const clipped = clip(polygon[0].slice(0, -1))
  if (clipped.length < 3) continue
  const simple = simplify(clipped, TOLERANCE)
  if (simple.length < 3) continue
  rings.push(simple.flatMap(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000)]))
}
const out = new URL('../src/island/japan-land.json', import.meta.url)
writeFileSync(out, JSON.stringify(rings))
console.log(`${rings.length} rings, ${rings.reduce((n, r) => n + r.length / 2, 0)} points, ${(JSON.stringify(rings).length / 1024).toFixed(0)} KB`)
