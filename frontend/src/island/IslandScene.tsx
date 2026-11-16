// The trip as floating islets, one per day, in the trip's colour theme,
// hovering over a low-poly map of the real coastline. A dashed line drops
// from each islet to where that day really happens; dashed routes on the map
// link the days in order. Opening a day flies the camera to its islet.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Trip } from '../types'
import { Islet } from './Islet'
import { ISLET_RADIUS } from './layout'
import { palette3d, type Palette3D } from './palette3d'
import { seeded } from './random'
import { buildTripMap, ISLET_HEIGHT, type TripMap } from './tripMap'

const FOV = 35
const OVERVIEW_TILT = THREE.MathUtils.degToRad(56)
const DAY_TILT = THREE.MathUtils.degToRad(54)

interface Props {
  trip: Trip
  openDay: number | null
  selectedStopId: string | null
  onPickDay: (index: number) => void
  onPickStop: (dayIndex: number, stopId: string) => void
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function IslandScene(props: Props) {
  const pal = palette3d(props.trip.theme)
  return (
    <div
      className="absolute inset-0"
      style={{ background: `linear-gradient(180deg, ${pal.skyTop} 0%, ${pal.skyBottom} 100%)` }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.1, far: 400, position: [0, 30, 36] }}
        gl={{ alpha: true, antialias: true }}
        fallback={
          <p className="absolute inset-x-0 bottom-4 text-center text-[13px] text-ink-soft">
            這個瀏覽器無法顯示行程島，請切換到「地圖」。
          </p>
        }
      >
        <Scene {...props} pal={pal} />
      </Canvas>
    </div>
  )
}

function Scene({ trip, openDay, selectedStopId, onPickDay, onPickStop, pal }: Props & { pal: Palette3D }) {
  const { size } = useThree()
  const aspect = size.width / Math.max(size.height, 1)
  // Rounded so small resizes don't rebuild the map.
  const viewAspect = Math.round(aspect * 4) / 4
  const map = useMemo(() => buildTripMap(trip.days, trip.id, viewAspect), [trip.days, trip.id, viewAspect])
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])
  const reach = Math.max(map.width, map.depth) / 2 + ISLET_RADIUS * 2

  return (
    <>
      <hemisphereLight args={[pal.skyTop, pal.rockDark, 1.4]} />
      <directionalLight
        position={[reach * 0.4, reach * 0.9, reach * 0.5]}
        intensity={1.7}
        castShadow
        shadow-intensity={0.55}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-far={reach * 4}
      />
      <ambientLight intensity={0.35} />

      <CameraRig map={map} openDay={openDay} aspect={aspect} reducedMotion={reducedMotion} />

      <MapBase map={map} pal={pal} />
      <GroundRoutes map={map} openDay={openDay} pal={pal} />
      <Leaders map={map} openDay={openDay} pal={pal} />

      {trip.days.map((day, i) => (
        <Islet
          key={day.date}
          day={day}
          index={i}
          position={map.islets[i]}
          pal={pal}
          open={openDay === i}
          faded={openDay !== null && openDay !== i}
          selectedStopId={selectedStopId}
          reducedMotion={reducedMotion}
          onPickDay={onPickDay}
          onPickStop={onPickStop}
        />
      ))}

      <Clouds map={map} reducedMotion={reducedMotion} seed={trip.id} />
    </>
  )
}

const LAND_TOP = 0.22
const SLAB = 0.7

/** The sea as a thick tile, with the real coastline raised on top of it. */
function MapBase({ map, pal }: { map: TripMap; pal: Palette3D }) {
  const land = useMemo(() => {
    const shapes = map.land.map((ring) => new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))))
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: LAND_TOP, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [map])

  return (
    <group>
      {/* sea tile: water on top, rock underneath */}
      <mesh position={[0, -SLAB / 2, 0]} receiveShadow>
        <boxGeometry args={[map.width, SLAB, map.depth]} />
        <meshStandardMaterial attach="material-0" color={pal.rock} flatShading />
        <meshStandardMaterial attach="material-1" color={pal.rock} flatShading />
        <meshStandardMaterial attach="material-2" color={new THREE.Color(pal.water).multiplyScalar(0.88)} />
        <meshStandardMaterial attach="material-3" color={pal.rockDark} flatShading />
        <meshStandardMaterial attach="material-4" color={pal.rock} flatShading />
        <meshStandardMaterial attach="material-5" color={pal.rock} flatShading />
      </mesh>
      <mesh geometry={land} receiveShadow castShadow>
        <meshStandardMaterial attach="material-0" color={pal.grass} flatShading />
        <meshStandardMaterial attach="material-1" color={pal.grassEdge} flatShading />
      </mesh>
    </group>
  )
}

/** A dashed line from each islet down to the day's real spot, and a pin there. */
function Leaders({ map, openDay, pal }: { map: TripMap; openDay: number | null; pal: Palette3D }) {
  return (
    <group>
      {map.ground.map(([gx, gz], i) => {
        const [ix, iy, iz] = map.islets[i]
        const active = openDay === null || openDay === i
        const from = new THREE.Vector3(ix, iy - 1.2, iz)
        const to = new THREE.Vector3(gx, LAND_TOP + 0.05, gz)
        const len = from.distanceTo(to)
        const dashes = Math.max(3, Math.floor(len / 0.32))
        const colour = openDay === i ? pal.accent : pal.ink
        return (
          <group key={i}>
            {Array.from({ length: dashes }, (_, k) => {
              const t = (k + 0.5) / dashes
              const p = from.clone().lerp(to, t)
              return (
                <mesh key={k} position={p}>
                  <sphereGeometry args={[0.035, 6, 4]} />
                  <meshBasicMaterial color={colour} transparent opacity={active ? 0.75 : 0.25} />
                </mesh>
              )
            })}
            <mesh position={[gx, LAND_TOP + 0.03, gz]}>
              <cylinderGeometry args={[0.2, 0.2, 0.06, 16]} />
              <meshStandardMaterial color={colour} transparent opacity={active ? 1 : 0.35} />
            </mesh>
            <mesh position={[gx, LAND_TOP + 0.02, gz]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.28, 0.36, 24]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={active ? 0.9 : 0.3} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** Dashes on the map from one day's spot to the next, in visiting order. */
function GroundRoutes({ map, openDay, pal }: { map: TripMap; openDay: number | null; pal: Palette3D }) {
  return (
    <group>
      {map.ground.slice(1).map((to, i) => {
        const from = map.ground[i]
        const dx = to[0] - from[0]
        const dz = to[1] - from[1]
        const len = Math.hypot(dx, dz)
        if (len < 0.5) return null // same place two days running
        const angle = Math.atan2(dx, dz)
        const touches = openDay === i || openDay === i + 1
        const n = Math.max(2, Math.floor(len / 0.5))
        return (
          <group key={i}>
            {Array.from({ length: n }, (_, k) => {
              const t = (k + 0.5) / n
              return (
                <mesh key={k} position={[from[0] + dx * t, LAND_TOP + 0.04, from[1] + dz * t]} rotation={[0, angle, 0]}>
                  <boxGeometry args={[0.09, 0.03, 0.26]} />
                  <meshBasicMaterial color={touches ? pal.accent : '#ffffff'} transparent opacity={touches ? 1 : 0.85} />
                </mesh>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}

/** A few clouds drifting between the map and the islets. */
function Clouds({ map, reducedMotion, seed }: { map: TripMap; reducedMotion: boolean; seed: string }) {
  const group = useRef<THREE.Group>(null)
  const clouds = useMemo(() => {
    const rand = seeded(seed)
    return Array.from({ length: 6 }, () => ({
      x: (rand() - 0.5) * map.width,
      y: 1.4 + rand() * 0.8,
      z: (rand() - 0.5) * map.depth,
      s: 0.5 + rand() * 0.5,
    }))
  }, [map, seed])

  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return
    group.current.position.x = ((group.current.position.x + delta * 0.12 + map.width / 2) % map.width) - map.width / 2
  })

  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {[
            [0, 0, 0, 0.7],
            [0.6, -0.1, 0.1, 0.5],
            [-0.6, -0.12, -0.05, 0.5],
          ].map(([x, y, z, r], j) => (
            <mesh key={j} position={[x, y, z]}>
              <icosahedronGeometry args={[r, 1]} />
              <meshStandardMaterial color="#ffffff" flatShading transparent opacity={0.7} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** Glides the camera to frame the whole map, or the open day's islet. */
function CameraRig({
  map,
  openDay,
  aspect,
  reducedMotion,
}: {
  map: TripMap
  openDay: number | null
  aspect: number
  reducedMotion: boolean
}) {
  const { camera } = useThree()
  const lookAt = useRef(new THREE.Vector3())

  const goal = useMemo(() => {
    const vfov = THREE.MathUtils.degToRad(FOV)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    if (openDay !== null && map.islets[openDay]) {
      const [x, y, z] = map.islets[openDay]
      const span = ISLET_RADIUS * 2 + 0.4
      const dist = Math.max(span / (2 * Math.tan(hfov / 2)), span / (2 * Math.tan(vfov / 2))) * 0.95
      const target = new THREE.Vector3(x, y + 0.3, z)
      const pos = target.clone().add(new THREE.Vector3(0, Math.sin(DAY_TILT) * dist, Math.cos(DAY_TILT) * dist))
      return { pos, target }
    }
    // Frame the islets and their spots on the map; the map itself runs on past the edges.
    const xs = [...map.islets.flatMap((p) => [p[0] - ISLET_RADIUS, p[0] + ISLET_RADIUS]), ...map.ground.map((g) => g[0])]
    const zs = [...map.islets.flatMap((p) => [p[2] - ISLET_RADIUS, p[2] + ISLET_RADIUS]), ...map.ground.map((g) => g[1])]
    // Islets float closer to the camera than the map, so they look wider: leave room at the sides.
    const width = (Math.max(...xs) - Math.min(...xs)) * 1.15 + 1.5
    const depth = (Math.max(...zs) - Math.min(...zs)) * Math.sin(OVERVIEW_TILT) + ISLET_HEIGHT * Math.cos(OVERVIEW_TILT) + 4
    const dist = Math.max(width / (2 * Math.tan(hfov / 2)), depth / (2 * Math.tan(vfov / 2))) * 1.05
    // Aim a little north of the middle so the islets sit lower, clear of the title card.
    const target = new THREE.Vector3((Math.max(...xs) + Math.min(...xs)) / 2, ISLET_HEIGHT * 0.45, (Math.max(...zs) + Math.min(...zs)) / 2 - 1.3)
    const pos = target.clone().add(new THREE.Vector3(0, Math.sin(OVERVIEW_TILT) * dist, Math.cos(OVERVIEW_TILT) * dist))
    return { pos, target }
  }, [map, openDay, aspect])

  useFrame((_, delta) => {
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 3.2)
    camera.position.lerp(goal.pos, k)
    lookAt.current.lerp(goal.target, k)
    camera.lookAt(lookAt.current)
  })

  return null
}
