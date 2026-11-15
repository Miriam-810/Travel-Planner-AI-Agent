// The trip as floating islets, one per day, in the trip's colour theme.
// Overview shows every day with a numbered badge; opening a day flies the
// camera to its islet and shows numbered pins for its stops.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Trip } from '../types'
import { Islet } from './Islet'
import { ISLET_RADIUS } from './layout'
import { palette3d, type Palette3D } from './palette3d'
import { seeded } from './random'

const SPACING = 5.6
const FOV = 35
const OVERVIEW_TILT = THREE.MathUtils.degToRad(48)
const DAY_TILT = THREE.MathUtils.degToRad(42)

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
        camera={{ fov: FOV, near: 0.1, far: 200, position: [0, 20, 26] }}
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

/** Islet centres in visiting order: one row for short trips, a snake of rows otherwise. */
function layout(count: number, aspect: number): [number, number, number][] {
  const cols = aspect < 1 ? 2 : count <= 4 ? count : Math.ceil(count / 2)
  const rows = Math.ceil(count / cols)
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols)
    const inRow = i % cols
    const col = row % 2 === 0 ? inRow : cols - 1 - inRow
    const x = (col - (cols - 1) / 2) * SPACING
    const z = (row - (rows - 1) / 2) * SPACING * 0.95 + (col % 2 === 0 ? -0.5 : 0.5)
    return [x, 0, z]
  })
}

function Scene({ trip, openDay, selectedStopId, onPickDay, onPickStop, pal }: Props & { pal: Palette3D }) {
  const { size } = useThree()
  const aspect = size.width / Math.max(size.height, 1)
  const positions = useMemo(() => layout(trip.days.length, aspect), [trip.days.length, aspect])
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  return (
    <>
      <hemisphereLight args={[pal.skyTop, pal.rockDark, 1.1]} />
      <directionalLight
        position={[8, 14, 10]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <ambientLight intensity={0.35} />

      <CameraRig positions={positions} openDay={openDay} aspect={aspect} reducedMotion={reducedMotion} />

      {trip.days.map((day, i) => (
        <Islet
          key={day.date}
          day={day}
          index={i}
          position={positions[i]}
          pal={pal}
          open={openDay === i}
          faded={openDay !== null && openDay !== i}
          selectedStopId={selectedStopId}
          reducedMotion={reducedMotion}
          onPickDay={onPickDay}
          onPickStop={onPickStop}
        />
      ))}

      {positions.slice(1).map((p, i) => (
        <Bridge key={i} from={positions[i]} to={p} color={pal.path} />
      ))}

      <Clouds positions={positions} reducedMotion={reducedMotion} seed={trip.id} />
    </>
  )
}

/** Planks floating between two consecutive days. */
function Bridge({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const a = new THREE.Vector3(...from)
  const b = new THREE.Vector3(...to)
  const dir = b.clone().sub(a)
  const len = dir.length()
  const angle = Math.atan2(dir.x, dir.z)
  const start = ISLET_RADIUS * 0.95
  const planks = Math.max(3, Math.floor((len - start * 2) / 0.42))
  return (
    <group>
      {Array.from({ length: planks }, (_, i) => {
        const t = (start + ((len - start * 2) * (i + 0.5)) / planks) / len
        const p = a.clone().lerp(b, t)
        const sag = Math.sin(t * Math.PI) * 0.25
        return (
          <mesh key={i} position={[p.x, 0.22 - sag, p.z]} rotation={[0, angle, 0]} castShadow>
            <boxGeometry args={[0.5, 0.05, 0.22]} />
            <meshStandardMaterial color={color} flatShading />
          </mesh>
        )
      })}
    </group>
  )
}

function Clouds({ positions, reducedMotion, seed }: { positions: [number, number, number][]; reducedMotion: boolean; seed: string }) {
  const group = useRef<THREE.Group>(null)
  const clouds = useMemo(() => {
    const rand = seeded(seed)
    const xs = positions.map((p) => p[0])
    const minX = Math.min(...xs) - 4
    const span = Math.max(...xs) + 4 - minX
    return Array.from({ length: 5 }, () => ({
      x: minX + rand() * span,
      y: -1.6 - rand() * 1.4,
      z: (rand() - 0.5) * 10,
      s: 0.6 + rand() * 0.7,
    }))
  }, [positions, seed])

  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return
    group.current.position.x = (group.current.position.x + delta * 0.15) % 6
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
              <icosahedronGeometry args={[r, 0]} />
              <meshStandardMaterial color="#ffffff" flatShading transparent opacity={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** Glides the camera to frame every islet, or the open day's islet. */
function CameraRig({
  positions,
  openDay,
  aspect,
  reducedMotion,
}: {
  positions: [number, number, number][]
  openDay: number | null
  aspect: number
  reducedMotion: boolean
}) {
  const { camera } = useThree()
  const lookAt = useRef(new THREE.Vector3())

  const goal = useMemo(() => {
    const vfov = THREE.MathUtils.degToRad(FOV)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    if (openDay !== null && positions[openDay]) {
      const [x, , z] = positions[openDay]
      const span = ISLET_RADIUS * 2 + 1.2
      const dist = Math.max(span / (2 * Math.tan(hfov / 2)), span / (2 * Math.tan(vfov / 2))) * 1.02
      const target = new THREE.Vector3(x, 0.3, z)
      const pos = target.clone().add(new THREE.Vector3(0, Math.sin(DAY_TILT) * dist, Math.cos(DAY_TILT) * dist))
      return { pos, target }
    }
    const xs = positions.map((p) => p[0])
    const zs = positions.map((p) => p[2])
    const width = Math.max(...xs) - Math.min(...xs) + ISLET_RADIUS * 2.6
    const depth = (Math.max(...zs) - Math.min(...zs) + ISLET_RADIUS * 2.6) * Math.sin(OVERVIEW_TILT) + 3
    const dist = Math.max(width / (2 * Math.tan(hfov / 2)), depth / (2 * Math.tan(vfov / 2))) * 1.15
    // Aim a little behind the middle so the islets sit lower, clear of the title card at the top.
    const target = new THREE.Vector3((Math.max(...xs) + Math.min(...xs)) / 2, 0.6, (Math.max(...zs) + Math.min(...zs)) / 2 - 1.4)
    const pos = target.clone().add(new THREE.Vector3(0, Math.sin(OVERVIEW_TILT) * dist, Math.cos(OVERVIEW_TILT) * dist))
    return { pos, target }
  }, [positions, openDay, aspect])

  useFrame((_, delta) => {
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 3.2)
    camera.position.lerp(goal.pos, k)
    lookAt.current.lerp(goal.target, k)
    camera.lookAt(lookAt.current)
  })

  return null
}
