// Low-poly island shapes: a slightly irregular grassy disc on top of a
// jagged rock cone. Vertices are jittered with a seeded random so every day
// gets its own silhouette.
import * as THREE from 'three'

export const SIDES = 9

/** Outline radii around the island, shared by the top and the rock below. */
export function outline(rand: () => number, radius: number): number[] {
  return Array.from({ length: SIDES }, () => radius * (0.86 + rand() * 0.24))
}

/** Flat-shaded grass top: a fan of triangles with a thin skirt. */
export function topGeometry(radii: number[], height = 0.35): THREE.BufferGeometry {
  const pts: number[] = []
  const ring = (i: number, y: number, scale = 1) => {
    const a = (i / SIDES) * Math.PI * 2
    const r = radii[i % SIDES] * scale
    return [Math.cos(a) * r, y, Math.sin(a) * r]
  }
  for (let i = 0; i < SIDES; i++) {
    // top face
    pts.push(0, height, 0, ...ring(i + 1, height), ...ring(i, height))
    // side skirt (two triangles)
    const a = ring(i, height)
    const b = ring(i + 1, height)
    const c = ring(i, 0, 1.02)
    const d = ring(i + 1, 0, 1.02)
    pts.push(...a, ...b, ...c, ...b, ...d, ...c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  g.computeVertexNormals()
  return g
}

/** Jagged rock underside: two rings narrowing to a tip. */
export function rockGeometry(radii: number[], rand: () => number, depth: number): THREE.BufferGeometry {
  const ring = (scale: number, y: number) =>
    radii.map((r, i) => {
      const a = (i / SIDES) * Math.PI * 2 + (scale < 1 ? 0.25 : 0)
      const rr = r * scale * (0.9 + rand() * 0.2)
      return new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr)
    })
  const top = ring(1.02, 0)
  const mid = ring(0.62, -depth * 0.45)
  const tip = new THREE.Vector3((rand() - 0.5) * 0.4, -depth, (rand() - 0.5) * 0.4)
  const pts: number[] = []
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES
    tri(top[i], top[j], mid[i])
    tri(top[j], mid[j], mid[i])
    tri(mid[i], mid[j], tip)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  g.computeVertexNormals()
  return g
}
