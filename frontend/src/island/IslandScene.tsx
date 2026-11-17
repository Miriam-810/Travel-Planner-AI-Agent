// The trip as a game-like 3D board map: the real coastline, every stop as a
// little scene (ramen shop, shrine, castle…) at its real position, and a
// dotted trail through the stops in visiting order. The overview shows a
// numbered flag for each day; opening a day flies the camera down to it and
// numbers its stops.
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Trip } from '../types'
import { monthDay, weekdayZh } from '../lib/format'
import { citiesOnTrip } from './cities'
import { badgeTexture } from './labels'
import { Landmark } from './landmarks'
import { palette3d, type Palette3D } from './palette3d'
import { seeded } from './random'
import { PIECE_HEIGHT, sceneOf } from './sceneKinds'
import { ScenePiece } from './scenes'
import { loadDetail, loadTerrain, type Detail, type Terrain } from './terrain'
import { daylight, hourOf, skyAt, type Sky } from './sky'
import { buildTripMap, onLand, toScene, type P, type TripMap } from './tripMap'

const FOV = 35
const OVERVIEW_TILT = THREE.MathUtils.degToRad(55)
const DAY_TILT = THREE.MathUtils.degToRad(52)
const LAND_TOP = 0.16
const SLAB = 0.8
/** Scene pieces are modelled about 0.6 wide. */
const MODEL_SIZE = 0.6

interface Props {
  trip: Trip
  openDay: number | null
  selectedStopId: string | null
  onPickDay: (index: number) => void
  onPickStop: (dayIndex: number, stopId: string) => void
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Ground height at (x, z): the real terrain once it has loaded, flat land before. */
const GroundCtx = createContext<(x: number, z: number) => number>(() => LAND_TOP)
const useGround = () => useContext(GroundCtx)

/** Fetches the real terrain for the map; null until it arrives, or if it can't be had. */
function useTerrain(map: TripMap, pal: Palette3D): Terrain | null {
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    let loaded: Terrain | null = null
    loadTerrain(map, pal, ctrl.signal)
      .then((t) => {
        loaded = t
        setTerrain(t)
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) console.warn('terrain unavailable, keeping the flat map', err)
      })
    return () => {
      ctrl.abort()
      loaded?.texture.dispose()
      setTerrain(null)
    }
  }, [map, pal])
  return terrain
}

function pointer(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : ''
}

const PHASE_TEXT = { day: '白天', dawn: '清晨', dusk: '黃昏', night: '夜晚' } as const

/**
 * The moment shown: the selected stop's arrival (or the day's first stop), on
 * that day, at that place, under that day's weather. The overview is plain daylight.
 */
function useMoment(trip: Trip, openDay: number | null, selectedStopId: string | null, pal: Palette3D) {
  return useMemo(() => {
    const day = openDay !== null ? trip.days[openDay] : null
    if (!day || day.stops.length === 0) return { sky: daylight(pal), label: null }
    const stop = day.stops.find((s) => s.id === selectedStopId) ?? day.stops[0]
    const lat = day.stops.reduce((n, s) => n + s.lat, 0) / day.stops.length
    const lng = day.stops.reduce((n, s) => n + s.lng, 0) / day.stops.length
    const sky = skyAt(pal, day.date, lat, lng, hourOf(stop.arrive), day.weather?.summary)
    const w = day.weather
    const label = `${monthDay(day.date)}（${weekdayZh(day.date)}）${stop.arrive.slice(0, 5)}・${PHASE_TEXT[sky.phase]}${
      w ? `・${w.summary} ${Math.round(w.low_c)}°/${Math.round(w.high_c)}°` : ''
    }`
    return { sky, label }
  }, [trip.days, openDay, selectedStopId, pal])
}

export default function IslandScene(props: Props) {
  const pal = palette3d(props.trip.theme)
  const { sky, label } = useMoment(props.trip, props.openDay, props.selectedStopId, pal)
  return (
    <div
      className="absolute inset-0 transition-[background] duration-700"
      style={{ background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.bottom} 100%)` }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.01, far: 500, position: [0, 30, 30] }}
        gl={{ alpha: true, antialias: true }}
        fallback={
          <p className="absolute inset-x-0 bottom-4 text-center text-[13px] text-ink-soft">
            這個瀏覽器無法顯示立體地圖，請切換到「地圖」。
          </p>
        }
      >
        <Scene {...props} pal={pal} sky={sky} />
      </Canvas>
      {label && (
        <p
          className={`pointer-events-none absolute right-3 bottom-6 m-0 rounded-full px-3 py-1 text-[12.5px] tabular-nums backdrop-blur ${
            sky.night > 0.5 ? 'bg-ink/55 text-white' : 'bg-cream/85 text-ink'
          }`}
        >
          {label}
        </p>
      )}
      <p className="pointer-events-none absolute right-3 bottom-1.5 m-0 text-[10px] text-ink-soft/80">
        地形：国土地理院｜© OpenStreetMap・OpenFreeMap
      </p>
    </div>
  )
}

function Scene({ trip, openDay, selectedStopId, onPickDay, onPickStop, pal, sky }: Props & { pal: Palette3D; sky: Sky }) {
  const { size } = useThree()
  const aspect = size.width / Math.max(size.height, 1)
  // Rounded so small resizes don't rebuild the map.
  const viewAspect = Math.round(aspect * 4) / 4
  const map = useMemo(() => buildTripMap(trip.days, trip.id, viewAspect), [trip.days, trip.id, viewAspect])
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])
  const terrain = useTerrain(map, pal)
  // Street detail covers the day's main group, or a selected stop that lies outside it.
  const detailAt = useMemo((): P | null => {
    if (openDay === null) return null
    const layout = map.days[openDay]
    const i = trip.days[openDay].stops.findIndex((s) => s.id === selectedStopId)
    const stop = layout.stops[i]
    const reach = detailHalf(layout)
    if (stop && (Math.abs(stop[0] - layout.centre[0]) > reach[0] * 0.7 || Math.abs(stop[1] - layout.centre[1]) > reach[1] * 0.7)) return stop
    return layout.centre
  }, [map, trip.days, openDay, selectedStopId])
  const ground = useMemo(() => (terrain ? terrain.heightAt : () => LAND_TOP), [terrain])

  return (
    <GroundCtx.Provider value={ground}>
      <Lights sky={sky} reducedMotion={reducedMotion} />

      <CameraRig
        map={map}
        openDay={openDay}
        selected={openDay === null ? -1 : trip.days[openDay].stops.findIndex((s) => s.id === selectedStopId)}
        aspect={aspect}
        reducedMotion={reducedMotion}
      />
      {terrain ? <TerrainMesh map={map} terrain={terrain} pal={pal} /> : <MapBase map={map} pal={pal} />}
      {detailAt && <DayDetail key={`${openDay}-${detailAt.join()}`} map={map} day={openDay!} at={detailAt} pal={pal} />}
      {/* Trees are sized for the whole map; zoomed into a day they would tower over the scenes. */}
      {openDay === null && <Trees map={map} pal={pal} seed={trip.id} terrain={terrain} />}
      <Trail map={map} openDay={openDay} pal={pal} />

      {trip.days.map((day, di) => {
        const layout = map.days[di]
        const open = openDay === di
        // Zoomed into one day, other days' scenes would loom huge or crowd it: show only this day.
        if (openDay !== null && !open) return null
        const scale = layout.piece / MODEL_SIZE
        return (
          <group key={day.date}>
            {day.stops.map((stop, si) => {
              const [x, z] = layout.stops[si]
              const selected = open && stop.id === selectedStopId
              const kind = sceneOf(stop)
              return (
                <group key={stop.id}>
                  <group
                    position={[x, ground(x, z), z]}
                    scale={scale * (selected ? 1.18 : 1)}
                    onClick={(e: ThreeEvent<MouseEvent>) => {
                      e.stopPropagation()
                      if (open) onPickStop(di, stop.id)
                      else onPickDay(di)
                    }}
                    onPointerOver={(e) => {
                      e.stopPropagation()
                      pointer(true)
                    }}
                    onPointerOut={() => pointer(false)}
                  >
                    <GroundShadow radius={0.45} y={0.005} />
                    <ScenePiece
                      kind={kind}
                      pal={pal}
                      opacity={1}
                      reducedMotion={reducedMotion}
                    />
                  </group>
                  {open && (
                    <sprite
                      position={[x, ground(x, z) + (PIECE_HEIGHT[kind] + 0.22) * scale * (selected ? 1.18 : 1), z]}
                      scale={Array(3).fill(layout.piece * (selected ? 0.62 : 0.48)) as [number, number, number]}
                      renderOrder={10}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPickStop(di, stop.id)
                      }}
                    >
                      <spriteMaterial map={badgeTexture(String(si + 1), selected ? pal.ink : pal.accent)} depthTest={false} />
                    </sprite>
                  )}
                </group>
              )
            })}
          </group>
        )
      })}

      {openDay !== null && sky.night > 0.05 && <Lamps layout={map.days[openDay]} night={sky.night} />}
      {openDay !== null && sky.precip !== 'none' && !reducedMotion && (
        <Weather key={`${openDay}-${sky.precip}`} layout={map.days[openDay]} precip={sky.precip} />
      )}
      {openDay === null && <Landmarks trip={trip} map={map} />}
      {openDay === null && <DayFlags map={map} openDay={openDay} pal={pal} onPickDay={onPickDay} reducedMotion={reducedMotion} />}
    </GroundCtx.Provider>
  )
}

/** The sea as a thick board, with the real coastline raised on top of it. */
function MapBase({ map, pal }: { map: TripMap; pal: Palette3D }) {
  const land = useMemo(() => {
    const shapes = map.land.map((ring) => new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))))
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: LAND_TOP, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [map])
  const sea = useMemo(() => new THREE.Color(pal.water).multiplyScalar(0.9), [pal.water])

  return (
    <group>
      <mesh position={[0, -SLAB / 2, 0]}>
        <boxGeometry args={[map.width, SLAB, map.depth]} />
        <meshStandardMaterial attach="material-0" color={pal.rock} flatShading />
        <meshStandardMaterial attach="material-1" color={pal.rock} flatShading />
        <meshStandardMaterial attach="material-2" color={sea} roughness={0.6} />
        <meshStandardMaterial attach="material-3" color={pal.rockDark} flatShading />
        <meshStandardMaterial attach="material-4" color={pal.rock} flatShading />
        <meshStandardMaterial attach="material-5" color={pal.rock} flatShading />
      </mesh>
      <mesh geometry={land}>
        <meshStandardMaterial attach="material-0" color={pal.grass} flatShading />
        <meshStandardMaterial attach="material-1" color={pal.grassEdge} flatShading />
      </mesh>
    </group>
  )
}

/** The real terrain: a low-poly height field on the sea board, painted with the ground cover. */
function TerrainMesh({ map, terrain, pal }: { map: TripMap; terrain: Terrain; pal: Palette3D }) {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(map.width, map.depth, terrain.cols - 1, terrain.rows - 1)
    plane.rotateX(-Math.PI / 2) // rows run north to south, like the height grid
    const pos = plane.getAttribute('position')
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrain.heights[i])
    const geo = plane.toNonIndexed()
    plane.dispose()
    geo.computeVertexNormals()
    return geo
  }, [map, terrain])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group>
      <mesh position={[0, -SLAB / 2 - 0.05, 0]}>
        <boxGeometry args={[map.width, SLAB, map.depth]} />
        <meshStandardMaterial color={pal.rock} flatShading />
      </mesh>
      <mesh geometry={geometry} renderOrder={-2}>
        <meshStandardMaterial map={terrain.texture} flatShading roughness={0.95} />
      </mesh>
    </group>
  )
}

/**
 * Street-level ground for the open day: real streets, buildings, rivers and
 * parks around its stops, laid over the terrain (the map texture is far too
 * coarse up close).
 */
function detailHalf(layout: TripMap['days'][number]): P {
  const pad = layout.piece * 3
  return [Math.max(layout.half[0] + pad, layout.piece * 4), Math.max(layout.half[1] + pad, layout.piece * 4)]
}

function DayDetail({ map, day, at, pal }: { map: TripMap; day: number; at: P; pal: Palette3D }) {
  const ground = useGround()
  const [detail, setDetail] = useState<Detail | null>(null)
  const layout = map.days[day]

  useEffect(() => {
    const ctrl = new AbortController()
    const [hx, hz] = detailHalf(layout)
    let loaded: Detail | null = null
    loadDetail(map, pal, { cx: at[0], cz: at[1], hx, hz }, ctrl.signal)
      .then((d) => {
        loaded = d
        setDetail(d)
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) console.warn('street detail unavailable', err)
      })
    return () => {
      ctrl.abort()
      loaded?.texture.dispose()
    }
  }, [map, layout, at, pal])

  const geometry = useMemo(() => {
    if (!detail) return null
    const seg = 48
    const plane = new THREE.PlaneGeometry(detail.width, detail.depth, seg, seg)
    plane.rotateX(-Math.PI / 2)
    plane.translate(detail.x0 + detail.width / 2, 0, detail.z0 + detail.depth / 2)
    const pos = plane.getAttribute('position')
    // Lift it clear of the terrain: the terrain's flat triangles can bulge above a surface that
    // follows the smooth height curve, and would show the coarse map through in pale patches.
    const lift = layout.piece * 0.06
    for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)) + lift)
    plane.computeVertexNormals()
    return plane
  }, [detail, ground, layout.piece])
  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!detail || !geometry) return null
  return (
    // Drawn right after the terrain and over it whatever the depth: where the terrain's flat
    // triangles bulge above this smooth sheet, the coarse map must not show through.
    // Scenes, pins and trails are drawn after it, so they stay on top.
    <mesh geometry={geometry} raycast={() => null} renderOrder={-1}>
      <meshStandardMaterial map={detail.texture} roughness={0.95} depthTest={false} />
    </mesh>
  )
}

/** Sun (or moon), sky light and fill light, easing towards the moment's sky. */
function Lights({ sky, reducedMotion }: { sky: Sky; reducedMotion: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const fill = useRef<THREE.AmbientLight>(null)
  const target = useMemo(
    () => ({
      sunColour: new THREE.Color(sky.sunColour),
      sunPos: new THREE.Vector3(...sky.sunDir).multiplyScalar(40),
      hemiSky: new THREE.Color(sky.hemiSky),
      hemiGround: new THREE.Color(sky.hemiGround),
    }),
    [sky],
  )
  useFrame((_, delta) => {
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 2.5)
    if (sun.current) {
      sun.current.color.lerp(target.sunColour, k)
      sun.current.position.lerp(target.sunPos, k)
      sun.current.intensity += (sky.sunIntensity - sun.current.intensity) * k
    }
    if (hemi.current) {
      hemi.current.color.lerp(target.hemiSky, k)
      hemi.current.groundColor.lerp(target.hemiGround, k)
      hemi.current.intensity += (sky.hemiIntensity - hemi.current.intensity) * k
    }
    if (fill.current) fill.current.intensity += (sky.ambient - fill.current.intensity) * k
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={[sky.hemiSky, sky.hemiGround, sky.hemiIntensity]} />
      <directionalLight ref={sun} position={target.sunPos} intensity={sky.sunIntensity} color={sky.sunColour} />
      <ambientLight ref={fill} intensity={sky.ambient} />
    </>
  )
}

let shadowTexture: THREE.Texture | null = null
function shadowBlob(): THREE.Texture {
  if (shadowTexture) return shadowTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(20,24,34,0.55)')
  g.addColorStop(0.6, 'rgba(20,24,34,0.25)')
  g.addColorStop(1, 'rgba(20,24,34,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  shadowTexture = new THREE.CanvasTexture(canvas)
  return shadowTexture
}

/** A soft dark patch on the ground under a model, so white walls stand out from snow. */
function GroundShadow({ radius, y = 0.01 }: { radius: number; y?: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial map={shadowBlob()} transparent depthWrite={false} />
    </mesh>
  )
}

let lampTexture: THREE.Texture | null = null
function lampGlow(): THREE.Texture {
  if (lampTexture) return lampTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,224,150,1)')
  g.addColorStop(0.35, 'rgba(255,190,110,0.45)')
  g.addColorStop(1, 'rgba(255,170,90,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  lampTexture = new THREE.CanvasTexture(canvas)
  return lampTexture
}

/** After dark, every stop glows with warm light, like lit windows and lanterns. */
function Lamps({ layout, night }: { layout: TripMap['days'][number]; night: number }) {
  const ground = useGround()
  return (
    <group>
      {layout.stops.map(([x, z], i) => (
        <sprite key={i} position={[x, ground(x, z) + layout.piece * 0.35, z]} scale={layout.piece * 2.4} raycast={() => null}>
          <spriteMaterial map={lampGlow()} blending={THREE.AdditiveBlending} transparent opacity={night * 0.85} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

/** Rain streaks, snowflakes, and for storms the odd flash of lightning, over the open day. */
function Weather({ layout, precip }: { layout: TripMap['days'][number]; precip: 'rain' | 'snow' | 'storm' }) {
  const ground = useGround()
  const flakes = useRef<THREE.InstancedMesh>(null)
  const streaks = useRef<THREE.LineSegments>(null)
  const flash = useRef<THREE.AmbientLight>(null)
  const snow = precip === 'snow'
  const count = snow ? 500 : 1400
  const p = layout.piece
  const reach = Math.max(layout.half[0], layout.half[1]) + p * 4
  const floor = ground(layout.centre[0], layout.centre[1])
  const top = floor + p * (snow ? 5 : 3.5)
  const length = p * 0.22

  const drops = useMemo(() => {
    const rand = seeded(`weather-${precip}`)
    return Array.from({ length: count }, () => ({
      x: layout.centre[0] + (rand() - 0.5) * reach * 2,
      y0: floor + rand() * (top - floor),
      z: layout.centre[1] + (rand() - 0.5) * reach * 2,
      speed: snow ? p * (0.6 + rand() * 0.5) : p * (7 + rand() * 3),
      phase: rand() * Math.PI * 2,
    }))
  }, [count, layout, reach, floor, top, p, snow, precip])

  // Rain as hairline segments: always one pixel wide, however close to the camera.
  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3))
    return geo
  }, [count])
  useEffect(() => () => lineGeo.dispose(), [lineGeo])

  const nextFlash = useRef(3)
  // Current heights, kept outside React: they change every frame.
  const heights = useRef<Float32Array | null>(null)
  const m = useMemo(() => new THREE.Matrix4(), [])
  useFrame(({ clock }, delta) => {
    if (heights.current?.length !== drops.length) heights.current = Float32Array.from(drops, (d) => d.y0)
    const ys = heights.current
    const t = clock.elapsedTime
    const pos = lineGeo.getAttribute('position') as THREE.BufferAttribute
    drops.forEach((d, i) => {
      ys[i] -= d.speed * delta
      if (ys[i] < floor) ys[i] = top
      if (snow) {
        const sway = Math.sin(t * 1.3 + d.phase) * p * 0.25
        m.makeTranslation(d.x + sway, ys[i], d.z)
        flakes.current?.setMatrixAt(i, m)
      } else {
        // A slight slant, as if blown by the wind.
        pos.setXYZ(i * 2, d.x, ys[i], d.z)
        pos.setXYZ(i * 2 + 1, d.x - length * 0.15, ys[i] + length, d.z - length * 0.05)
      }
    })
    if (snow && flakes.current) flakes.current.instanceMatrix.needsUpdate = true
    if (!snow) pos.needsUpdate = true
    if (precip === 'storm' && flash.current) {
      if (t > nextFlash.current) {
        flash.current.intensity = 2.5
        nextFlash.current = t + 4 + Math.random() * 6
      }
      flash.current.intensity *= Math.exp(-delta * 9)
    }
  })

  return (
    <group>
      {snow ? (
        <instancedMesh ref={flakes} args={[undefined, undefined, count]} raycast={() => null} frustumCulled={false}>
          <icosahedronGeometry args={[p * 0.016, 0]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthWrite={false} />
        </instancedMesh>
      ) : (
        <lineSegments ref={streaks} geometry={lineGeo} raycast={() => null} frustumCulled={false}>
          <lineBasicMaterial color="#e3edf7" transparent opacity={0.6} depthWrite={false} />
        </lineSegments>
      )}
      {precip === 'storm' && <ambientLight ref={flash} intensity={0} color="#e8eeff" />}
    </group>
  )
}

/** Landmarks of the well-known places the trip visits, standing where they really are. */
function Landmarks({ trip, map }: { trip: Trip; map: TripMap }) {
  const ground = useGround()
  const placed = useMemo(
    () =>
      citiesOnTrip(trip)
        .map((c) => ({ city: c, at: toScene(map.frame, c.lng, c.lat) }))
        .filter(({ at }) => Math.abs(at[0]) < map.width / 2 - 1 && Math.abs(at[1]) < map.depth / 2 - 1),
    [trip, map],
  )
  return (
    <group>
      {placed.map(({ city, at: [x, z] }) => (
        <group key={city.name} position={[x, ground(x, z), z]} scale={4.2 * (city.size ?? 1)} raycast={() => null}>
          <GroundShadow radius={0.75} />
          <Landmark kind={city.landmark} />
        </group>
      ))}
    </group>
  )
}

/** Low-poly trees scattered over the land, kept clear of the stops. */
function Trees({ map, pal, seed, terrain }: { map: TripMap; pal: Palette3D; seed: string; terrain: Terrain | null }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const ground = useGround()
  const spots = useMemo(() => {
    const rand = seeded(`${seed}-trees`)
    const clear = map.days.flatMap((d) => d.stops.map((s) => ({ s, r: d.piece * 1.4 + 0.4 })))
    const out: { x: number; z: number; s: number }[] = []
    const want = Math.min(900, Math.round((map.width * map.depth) / 6))
    for (let tries = 0; out.length < want && tries < want * 6; tries++) {
      const x = (rand() - 0.5) * map.width * 0.98
      const z = (rand() - 0.5) * map.depth * 0.98
      // With real terrain, trees grow only in real forests; before it loads, anywhere on land.
      if (terrain ? !terrain.forestAt(x, z) : !onLand(x, z, map.land)) continue
      if (clear.some(({ s, r }) => Math.hypot(s[0] - x, s[1] - z) < r)) continue
      out.push({ x, z, s: 0.7 + rand() * 0.6 })
    }
    return out
  }, [map, seed, terrain])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const mat = new THREE.Matrix4()
    const colour = new THREE.Color()
    spots.forEach((t, i) => {
      mat.makeScale(t.s, t.s, t.s).setPosition(t.x, ground(t.x, t.z) + 0.3 * t.s, t.z)
      m.setMatrixAt(i, mat)
      m.setColorAt(i, colour.set(pal.leaves[i % pal.leaves.length]))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [spots, pal, ground])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]} raycast={() => null}>
      <coneGeometry args={[0.24, 0.6, 5]} />
      <meshStandardMaterial flatShading />
    </instancedMesh>
  )
}

/** A dotted trail through every stop in order: fine dots within a day, bigger ones between days. */
function Trail({ map, openDay, pal }: { map: TripMap; openDay: number | null; pal: Palette3D }) {
  const ground = useGround()
  const dots = useMemo(() => {
    const out: { p: P; r: number; day: number; between: boolean }[] = []
    const line = (a: P, b: P, step: number, r: number, day: number, between: boolean) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.floor(len / step)
      for (let k = 1; k < n; k++) {
        const t = k / n
        out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], r, day, between })
      }
    }
    map.days.forEach((d, di) => {
      for (let i = 1; i < d.stops.length; i++) line(d.stops[i - 1], d.stops[i], d.piece * 0.32, d.piece * 0.05, di, false)
      const next = map.days[di + 1]
      if (next && d.stops.length && next.stops.length) line(d.stops.at(-1)!, next.stops[0], 0.7, 0.13, di, true)
    })
    return out
  }, [map])

  return (
    <group>
      {dots.map((d, i) => {
        // Zoomed into a day, only that day's own trail is drawn; the big dots between days would loom.
        if (openDay !== null && (d.between || d.day !== openDay)) return null
        const active = openDay === d.day
        const dim = false
        return (
          <mesh key={i} position={[d.p[0], ground(d.p[0], d.p[1]) + d.r * 0.6, d.p[1]]} raycast={() => null}>
            <cylinderGeometry args={[d.r, d.r, d.r * 0.8, 8]} />
            <meshStandardMaterial
              color={active && !d.between ? pal.accent : d.between ? '#ffffff' : pal.path}
              transparent
              opacity={dim ? 0.35 : 1}
            />
          </mesh>
        )
      })}
    </group>
  )
}

const FLAG_GAP = 2.6

/**
 * Where each day's flag stands. Days that start in the same place (four days
 * in one city) fan out in a ring around it, each with a dotted line back to
 * the real spot, like spread-out pins on a map.
 */
function flagSpots(map: TripMap): { base: P; flag: P }[] {
  // Each flag stands at the day's main group of stops (its first stop could be a station in another town).
  const bases = map.days.map((d) => d.centre)
  const groups: number[][] = []
  bases.forEach((b, i) => {
    const g = groups.find((g) => Math.hypot(bases[g[0]][0] - b[0], bases[g[0]][1] - b[1]) < FLAG_GAP)
    if (g) g.push(i)
    else groups.push([i])
  })
  const out: { base: P; flag: P }[] = bases.map((b) => ({ base: b, flag: b }))
  for (const g of groups) {
    if (g.length === 1) continue
    const r = Math.max(FLAG_GAP * 0.75, (FLAG_GAP * g.length) / (2 * Math.PI))
    g.forEach((day, k) => {
      const a = -Math.PI / 2 + (k / g.length) * Math.PI * 2 // first day at the back, then clockwise
      const [x, z] = bases[g[0]]
      out[day] = { base: bases[day], flag: [x + Math.cos(a) * r, z + Math.sin(a) * r] }
    })
  }
  return out
}

/** A numbered flag for each day, so the overview reads like a board game. */
function DayFlags({
  map,
  openDay,
  pal,
  onPickDay,
  reducedMotion,
}: {
  map: TripMap
  openDay: number | null
  pal: Palette3D
  onPickDay: (i: number) => void
  reducedMotion: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const ground = useGround()
  const spots = useMemo(() => flagSpots(map), [map])
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    group.current.children.forEach((flag, i) => {
      flag.position.y = Math.sin(clock.elapsedTime * 1.4 + i) * 0.06
    })
  })
  return (
    <group ref={group}>
      {spots.map(({ base, flag }, i) => {
        if (openDay === i || !map.days[i].stops.length) return <group key={i} />
        const [x, z] = flag
        const dim = openDay !== null
        const moved = Math.hypot(flag[0] - base[0], flag[1] - base[1])
        const leaderDots = Math.floor(moved / 0.3)
        const y = ground(x, z)
        return (
          <group
            key={i}
            onClick={(e) => {
              e.stopPropagation()
              onPickDay(i)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              pointer(true)
            }}
            onPointerOut={() => pointer(false)}
          >
            {Array.from({ length: leaderDots }, (_, k) => {
              const t = (k + 0.5) / leaderDots
              return (
                <mesh
                  key={k}
                  position={[base[0] + (x - base[0]) * t, ground(base[0] + (x - base[0]) * t, base[1] + (z - base[1]) * t) + 0.03, base[1] + (z - base[1]) * t]}
                  raycast={() => null}
                >
                  <cylinderGeometry args={[0.05, 0.05, 0.04, 6]} />
                  <meshBasicMaterial color={pal.ink} transparent opacity={dim ? 0.2 : 0.55} />
                </mesh>
              )
            })}
            <mesh position={[x, y + 0.05, z]}>
              <cylinderGeometry args={[0.42, 0.48, 0.14, 10]} />
              <meshStandardMaterial color={pal.wall} transparent opacity={dim ? 0.4 : 1} />
            </mesh>
            <mesh position={[x, y + 1.6, z]}>
              <cylinderGeometry args={[0.07, 0.07, 3.2, 6]} />
              <meshStandardMaterial color={pal.ink} transparent opacity={dim ? 0.4 : 1} />
            </mesh>
            <sprite position={[x, y + 3.8, z]} scale={[2.4, 2.4, 2.4]} renderOrder={5}>
              <spriteMaterial map={badgeTexture(String(i + 1), pal.accent)} transparent opacity={dim ? 0.45 : 1} depthTest={false} />
            </sprite>
            {/* bigger invisible target, easy to tap */}
            <mesh position={[x, y + 2.8, z]} visible={false}>
              <sphereGeometry args={[1.3, 8, 8]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** Glides the camera to frame the whole trip, or the open day. */
function CameraRig({
  map,
  openDay,
  selected,
  aspect,
  reducedMotion,
}: {
  map: TripMap
  openDay: number | null
  /** Index of the selected stop in the open day, or -1. */
  selected: number
  aspect: number
  reducedMotion: boolean
}) {
  const { camera, size } = useThree()
  const lookAt = useRef(new THREE.Vector3())

  const goal = useMemo(() => {
    const vfov = THREE.MathUtils.degToRad(FOV)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const day = openDay !== null ? map.days[openDay] : null
    const tilt = day ? DAY_TILT : OVERVIEW_TILT
    // Zoomed into a day: centre on the selected stop if there is one (it may lie outside the main group).
    const [cx, cz] = day ? (day.stops[selected] ?? day.centre) : map.centre
    // Margin around the stops: a scene and a half for a day, room for the flags overall.
    const pad = day ? day.piece * 1.6 : 2.5
    const hx = (day ? day.half[0] : map.half[0]) + pad
    const hz = (day ? day.half[1] : map.half[1]) + pad
    const width = hx * 2
    // Flags stand about 4 units tall over the overview; a day's scenes about one scene.
    const depth = hz * 2 * Math.sin(tilt) + (day ? day.piece : 4.5) * Math.cos(tilt)

    // The title card (top) and the island/map switch (bottom) cover strips of the view:
    // fit everything into the clear band between them, and centre it there.
    const topInset = Math.min(110, size.height * 0.24)
    const bottomInset = Math.min(64, size.height * 0.15)
    const clear = Math.max(0.4, (size.height - topInset - bottomInset) / size.height)
    const dist = Math.max(width / (2 * Math.tan(hfov / 2)), depth / (2 * Math.tan(vfov / 2) * clear))
    // Shift the aim so the clear band's middle, not the canvas middle, lands on the stops.
    const viewHeight = 2 * dist * Math.tan(vfov / 2)
    const shift = (((topInset - bottomInset) / 2) / size.height) * viewHeight
    const target = new THREE.Vector3(cx, LAND_TOP, cz - shift / Math.sin(tilt))
    const pos = target.clone().add(new THREE.Vector3(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist))
    return { pos, target, dist }
  }, [map, openDay, selected, aspect, size.height])



  useFrame(({ camera: cam }, delta) => {
    // Depth precision follows the distance: a near plane far too close makes the sea and the board flicker.
    const persp = cam as THREE.PerspectiveCamera
    const near = Math.max(0.005, goal.dist * 0.02)
    if (persp.near !== near) {
      persp.near = near
      persp.far = goal.dist * 6 + 50
      persp.updateProjectionMatrix()
    }
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 3)
    camera.position.lerp(goal.pos, k)
    lookAt.current.lerp(goal.target, k)
    camera.lookAt(lookAt.current)
  })

  return null
}
