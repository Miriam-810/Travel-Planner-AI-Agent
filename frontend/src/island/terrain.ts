// Real terrain under the board map, fetched in the browser for the trip's area:
// - heights from the Geospatial Information Authority of Japan's elevation
//   tiles (標高タイル, 出典：国土地理院); sea has no value there, which also
//   gives the coastline;
// - what covers the ground (forest, farmland, towns, parks, lakes, rivers,
//   railways) from OpenStreetMap vector tiles served by OpenFreeMap.
// Both are drawn in the map's own projection (see tripMap.ts) and painted in
// the trip's colours, so the style stays low-poly and toy-like.
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import * as THREE from 'three'
import type { Palette3D } from './palette3d'
import { toScene, type GeoBox, type TripMap } from './tripMap'

const DEM_URL = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'
const DEM_MAX_ZOOM = 14
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet'
const VECTOR_MAX_ZOOM = 14
const MAX_TILES = 20

/** Grid vertices along the map's long side. */
const GRID = 200
/** Texture pixels along the map's long side. */
const TEXTURE = 2048
/** Tallest the terrain may stand, in scene units, whatever the scale. */
const MAX_RELIEF = 2.2
/** Mountains are drawn this many times taller than they are, so they read from above. */
const EXAGGERATION = 2.5
/** Land sits this far above the sea even where it is flat. */
export const LAND_BASE = 0.06

export interface Terrain {
  cols: number
  rows: number
  /** Scene-unit height of each grid vertex (sea is 0), row by row from north. */
  heights: Float32Array
  /** The painted ground: land cover, water, rivers, railways. */
  texture: THREE.CanvasTexture
  /** Scene height at (x, z). */
  heightAt: (x: number, z: number) => number
  /** Whether (x, z) is forest, for scattering trees. */
  forestAt: (x: number, z: number) => boolean
}

// --- Web Mercator tiles --------------------------------------------------------

const tileX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}
const lngOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const latOf = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

/** The most detailed zoom at which the box needs at most MAX_TILES tiles. */
function pickZoom(box: GeoBox, max: number): { z: number; x0: number; x1: number; y0: number; y1: number } {
  const { west, east, south, north } = box
  for (let z = max; z >= 3; z--) {
    const x0 = Math.floor(tileX(west, z))
    const x1 = Math.floor(tileX(east, z))
    const y0 = Math.floor(tileY(north, z))
    const y1 = Math.floor(tileY(south, z))
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES) return { z, x0, x1, y0, y1 }
  }
  const z = 3
  return { z, x0: Math.floor(tileX(west, z)), x1: Math.floor(tileX(east, z)), y0: Math.floor(tileY(north, z)), y1: Math.floor(tileY(south, z)) }
}

function tiles(range: ReturnType<typeof pickZoom>) {
  const out: { x: number; y: number }[] = []
  for (let x = range.x0; x <= range.x1; x++) for (let y = range.y0; y <= range.y1; y++) out.push({ x, y })
  return out
}

// --- heights ---------------------------------------------------------------------

/** Elevation in metres from a GSI dem_png pixel; NaN where there is no land (sea). */
function demMetres(r: number, g: number, b: number): number {
  const v = r * 65536 + g * 256 + b
  if (v === 8388608) return NaN
  return (v < 8388608 ? v : v - 16777216) * 0.01
}

async function loadImage(url: string, signal: AbortSignal): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url, { signal, mode: 'cors' })
    if (!res.ok) return null // missing tile: open sea, or outside Japan
    return await createImageBitmap(await res.blob())
  } catch (err) {
    if (signal.aborted) throw err
    return null
  }
}

async function loadHeights(map: TripMap, signal: AbortSignal, cols: number, rows: number) {
  const range = pickZoom(map.frame.box, DEM_MAX_ZOOM - 1)
  const w = (range.x1 - range.x0 + 1) * 256
  const h = (range.y1 - range.y0 + 1) * 256
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const list = tiles(range)
  const images = await Promise.all(
    list.map((t) => loadImage(DEM_URL.replace('{z}', String(range.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)), signal)),
  )
  // Missing tiles stay transparent black, which decodes as sea level.
  list.forEach((t, i) => {
    const img = images[i]
    if (img) ctx.drawImage(img, (t.x - range.x0) * 256, (t.y - range.y0) * 256)
  })
  const px = ctx.getImageData(0, 0, w, h).data

  const metres = new Float32Array(cols * rows)
  const { frame } = map
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = (c / (cols - 1) - 0.5) * map.width
      const sz = (r / (rows - 1) - 0.5) * map.depth
      const lng = frame.lng0 + sx / (frame.k * 111.32 * frame.unit)
      const lat = frame.lat0 - sz / (111.32 * frame.unit)
      const ix = Math.min(w - 1, Math.max(0, Math.floor((tileX(lng, range.z) - range.x0) * 256)))
      const iy = Math.min(h - 1, Math.max(0, Math.floor((tileY(lat, range.z) - range.y0) * 256)))
      const o = (iy * w + ix) * 4
      metres[r * cols + c] = px[o + 3] === 0 ? NaN : demMetres(px[o], px[o + 1], px[o + 2])
    }
  }
  return metres
}

// --- ground cover ------------------------------------------------------------------

interface Paint {
  sea: string
  land: string
  forest: string
  farm: string
  grassland: string
  town: string
  park: string
  sand: string
  ice: string
  rail: string
  road: string
  building: string
}

function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`
}

function paintFor(pal: Palette3D): Paint {
  // On a snowy (near-white) ground, light roads and pale towns vanish: darken them.
  const snowy = new THREE.Color(pal.grass).getHSL({ h: 0, s: 0, l: 0 }).l > 0.85
  const town = mix(pal.grass, '#8f9097', snowy ? 0.55 : 0.38)
  return {
    sea: `#${new THREE.Color(pal.water).multiplyScalar(0.9).getHexString()}`,
    land: pal.grass,
    forest: mix(pal.leaves[0], pal.grass, 0.25),
    farm: mix(pal.grass, '#e8d9a0', 0.35),
    grassland: mix(pal.grass, '#ffffff', 0.12),
    town,
    park: mix(pal.leaves[pal.leaves.length - 1], pal.grass, 0.45),
    sand: mix(pal.path, '#f1dfb0', 0.5),
    ice: '#f4f7fa',
    rail: pal.ink,
    road: snowy ? '#9ea3ad' : mix(pal.path, '#ffffff', 0.35),
    building: mix(town, '#3a3a44', snowy ? 0.32 : 0.22),
  }
}

const LANDCOVER: Record<string, keyof Paint> = {
  wood: 'forest',
  forest: 'forest',
  farmland: 'farm',
  grass: 'grassland',
  wetland: 'grassland',
  sand: 'sand',
  ice: 'ice',
  rock: 'grassland',
}
const LANDUSE: Record<string, keyof Paint> = {
  residential: 'town',
  commercial: 'town',
  industrial: 'town',
  retail: 'town',
  railway: 'town',
  suburb: 'town',
  neighbourhood: 'town',
}

/**
 * The current tile URL template (OpenFreeMap versions its tiles). Shared by
 * every map on the page, so it is fetched without any one caller's abort
 * signal: one map closing must not leave the others without tiles.
 */
let templatePromise: Promise<string | null> | null = null

function vectorTemplate(): Promise<string | null> {
  templatePromise ??= fetch(TILEJSON_URL)
    .then((res) => (res.ok ? (res.json() as Promise<{ tiles?: string[] }>) : null))
    .then((json) => json?.tiles?.[0] ?? null)
    .catch(() => null)
    .then((template) => {
      if (!template) templatePromise = null // try again next time
      return template
    })
  return templatePromise
}

interface Painter {
  ctx: OffscreenCanvasRenderingContext2D
  /** Forest mask (white = forest), when trees will be scattered from it. */
  forest: OffscreenCanvasRenderingContext2D | null
  toPx: (lng: number, lat: number) => [number, number]
  /** Close-up detail: streets and buildings too. */
  streets: boolean
  /** Line widths are multiplied by this (thicker for close-ups). */
  lineScale: number
}

async function paintVectorTiles(box: GeoBox, painter: Painter, paint: Paint, signal: AbortSignal) {
  const template = await vectorTemplate()
  if (signal.aborted) throw new DOMException('aborted', 'AbortError')
  if (!template) return
  const range = pickZoom(box, VECTOR_MAX_ZOOM)
  const list = tiles(range)
  const buffers = await Promise.all(
    list.map(async (t) => {
      try {
        const res = await fetch(template.replace('{z}', String(range.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)), { signal })
        return res.ok ? await res.arrayBuffer() : null
      } catch (err) {
        if (signal.aborted) throw err
        return null
      }
    }),
  )

  const decoded = list.flatMap((t, i) => (buffers[i] ? [{ t, tile: new VectorTile(new Pbf(buffers[i]!)) }] : []))

  const path = (ctx: OffscreenCanvasRenderingContext2D, rings: { x: number; y: number }[][], t: { x: number; y: number }, extent: number) => {
    ctx.beginPath()
    for (const ring of rings) {
      ring.forEach((p, k) => {
        const [x, y] = painter.toPx(lngOf(t.x + p.x / extent, range.z), latOf(t.y + p.y / extent, range.z))
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
    }
  }

  // Each pass paints over the one before: cover, then towns and parks, then water, then lines.
  const passes: { layer: string; pick: (props: Record<string, unknown>) => keyof Paint | null; kind: 'fill' | 'line'; width?: number }[] = [
    { layer: 'landcover', pick: (p) => LANDCOVER[String(p.class)] ?? null, kind: 'fill' },
    { layer: 'landuse', pick: (p) => LANDUSE[String(p.class)] ?? null, kind: 'fill' },
    { layer: 'park', pick: () => 'park', kind: 'fill' },
    { layer: 'water', pick: () => 'sea', kind: 'fill' },
    { layer: 'waterway', pick: (p) => (p.class === 'river' || p.class === 'canal' ? 'sea' : null), kind: 'line', width: 2.2 },
    ...(painter.streets
      ? [
          {
            layer: 'transportation',
            pick: (p: Record<string, unknown>) =>
              p.brunnel !== 'tunnel' && ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'].includes(String(p.class))
                ? ('road' as const)
                : null,
            kind: 'line' as const,
            width: 2.2,
          },
          { layer: 'building', pick: () => 'building' as const, kind: 'fill' as const },
        ]
      : []),
    {
      layer: 'transportation',
      pick: (p) => (p.class === 'rail' && p.brunnel !== 'tunnel' && !p.service ? 'rail' : null),
      kind: 'line',
      width: 1.6,
    },
  ]

  const { ctx, forest } = painter
  for (const pass of passes) {
    for (const { t, tile } of decoded) {
      const layer = tile.layers[pass.layer]
      if (!layer) continue
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i)
        const colour = pass.pick(f.properties)
        if (!colour) continue
        if (pass.kind === 'fill' && f.type !== 3) continue
        if (pass.kind === 'line' && f.type !== 2) continue
        const rings = f.loadGeometry()
        if (pass.kind === 'fill') {
          path(ctx, rings, t, layer.extent)
          ctx.fillStyle = paint[colour]
          ctx.fill('evenodd')
          if (!forest) continue
          if (pass.layer === 'landcover') {
            path(forest, rings, t, layer.extent)
            forest.fillStyle = colour === 'forest' ? '#fff' : '#000'
            forest.fill('evenodd')
          } else if (pass.layer !== 'park') {
            path(forest, rings, t, layer.extent)
            forest.fillStyle = '#000'
            forest.fill('evenodd')
          }
        } else {
          path(ctx, rings, t, layer.extent)
          ctx.strokeStyle = paint[colour]
          ctx.lineWidth = (pass.width ?? 1) * painter.lineScale
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.setLineDash(colour === 'rail' ? [5, 3] : [])
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    }
  }
}

// --- putting it together -------------------------------------------------------------

export async function loadTerrain(map: TripMap, pal: Palette3D, signal: AbortSignal): Promise<Terrain> {
  const longSide = Math.max(map.width, map.depth)
  const cols = Math.round((GRID * map.width) / longSide)
  const rows = Math.round((GRID * map.depth) / longSide)
  const texW = Math.round((TEXTURE * map.width) / longSide)
  const texH = Math.round((TEXTURE * map.depth) / longSide)
  const scale = texW / map.width

  const canvas = new OffscreenCanvas(texW, texH)
  const ctx = canvas.getContext('2d')!
  const forestCanvas = new OffscreenCanvas(Math.ceil(texW / 4), Math.ceil(texH / 4))
  const forest = forestCanvas.getContext('2d', { willReadFrequently: true })!
  forest.scale(0.25, 0.25)

  const toPx = (lng: number, lat: number): [number, number] => {
    const [x, z] = toScene(map.frame, lng, lat)
    return [(x + map.width / 2) * scale, (z + map.depth / 2) * scale]
  }
  const paint = paintFor(pal)

  // Sea, then the land outline, so the map still reads if the vector tiles fail.
  ctx.fillStyle = paint.sea
  ctx.fillRect(0, 0, texW, texH)
  ctx.fillStyle = paint.land
  for (const ring of map.land) {
    ctx.beginPath()
    ring.forEach(([x, z], k) => {
      const px = (x + map.width / 2) * scale
      const py = (z + map.depth / 2) * scale
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.fill()
  }
  forest.fillStyle = '#000'
  forest.fillRect(0, 0, texW, texH)

  const [metres] = await Promise.all([
    loadHeights(map, signal, cols, rows),
    paintVectorTiles(map.frame.box, { ctx, forest, toPx, streets: false, lineScale: 1 }, paint, signal),
  ])

  // Scene heights: exaggerated so hills read from above, but never taller than MAX_RELIEF.
  let highest = 1
  for (const m of metres) if (m > highest) highest = m
  const perMetre = Math.min((map.frame.unit / 1000) * EXAGGERATION, MAX_RELIEF / highest)
  const heights = new Float32Array(metres.length)
  metres.forEach((m, i) => {
    heights[i] = Number.isNaN(m) ? 0 : LAND_BASE + Math.max(0, m) * perMetre
  })

  const forestPx = forest.getImageData(0, 0, forestCanvas.width, forestCanvas.height).data
  const texture = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  const heightAt = (x: number, z: number) => {
    const fc = Math.min(cols - 1.001, Math.max(0, (x / map.width + 0.5) * (cols - 1)))
    const fr = Math.min(rows - 1.001, Math.max(0, (z / map.depth + 0.5) * (rows - 1)))
    const c = Math.floor(fc)
    const r = Math.floor(fr)
    const tx = fc - c
    const tz = fr - r
    const h = (cc: number, rr: number) => heights[rr * cols + cc]
    return (h(c, r) * (1 - tx) + h(c + 1, r) * tx) * (1 - tz) + (h(c, r + 1) * (1 - tx) + h(c + 1, r + 1) * tx) * tz
  }
  const forestAt = (x: number, z: number) => {
    const px = Math.floor(((x + map.width / 2) * scale) / 4)
    const py = Math.floor(((z + map.depth / 2) * scale) / 4)
    if (px < 0 || py < 0 || px >= forestCanvas.width || py >= forestCanvas.height) return false
    return forestPx[(py * forestCanvas.width + px) * 4] > 128
  }

  return { cols, rows, heights, texture, heightAt, forestAt }
}

// --- close-up of one day -------------------------------------------------------------

export interface Detail {
  /** Scene rectangle the detail covers. */
  x0: number
  z0: number
  width: number
  depth: number
  texture: THREE.CanvasTexture
}

const DETAIL_TEXTURE = 1536

/**
 * A sharper ground for the area around one day's stops: streets, buildings,
 * rivers and parks at street level, to lay over the terrain when zoomed in.
 */
export async function loadDetail(
  map: TripMap,
  pal: Palette3D,
  area: { cx: number; cz: number; hx: number; hz: number },
  signal: AbortSignal,
): Promise<Detail> {
  const { frame } = map
  const x0 = area.cx - area.hx
  const z0 = area.cz - area.hz
  const width = area.hx * 2
  const depth = area.hz * 2
  const lngAt = (x: number) => frame.lng0 + x / (frame.k * 111.32 * frame.unit)
  const latAt = (z: number) => frame.lat0 - z / (111.32 * frame.unit)
  const box: GeoBox = { west: lngAt(x0), east: lngAt(x0 + width), north: latAt(z0), south: latAt(z0 + depth) }

  const long = Math.max(width, depth)
  const texW = Math.round((DETAIL_TEXTURE * width) / long)
  const texH = Math.round((DETAIL_TEXTURE * depth) / long)
  const scale = texW / width
  const canvas = new OffscreenCanvas(texW, texH)
  const ctx = canvas.getContext('2d')!
  const paint = paintFor(pal)
  const toPx = (lng: number, lat: number): [number, number] => {
    const [x, z] = toScene(frame, lng, lat)
    return [(x - x0) * scale, (z - z0) * scale]
  }

  // Land everywhere to start; the sea comes in with the water layer.
  ctx.fillStyle = paint.land
  ctx.fillRect(0, 0, texW, texH)
  await paintVectorTiles(box, { ctx, forest: null, toPx, streets: true, lineScale: 1.4 }, paint, signal)

  const texture = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { x0, z0, width, depth, texture }
}
