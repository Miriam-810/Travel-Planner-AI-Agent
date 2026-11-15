// The home page globe: a dark low-poly earth you can spin, with a little
// island floating over every trip this device has planned. Trips still ahead
// are islands under construction (see-through, with a flag); finished trips
// are built and glow.
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { tripCentre, tripStatus, type SavedTrip, type TripStatus } from '../lib/library'
import { palette3d } from '../island/palette3d'
import { seeded } from '../island/random'
import { isLand } from './land'

export interface GlobeProps {
  trips: SavedTrip[]
  onOpen: (id: string) => void
  onHover: (id: string | null) => void
}

const JAPAN = { lat: 36, lng: 138 }
const CAMERA_DISTANCE = 4

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Unit vector for a place; longitude 0 faces +z. */
function toVector(lat: number, lng: number): THREE.Vector3 {
  const la = THREE.MathUtils.degToRad(lat)
  const ln = THREE.MathUtils.degToRad(lng)
  return new THREE.Vector3(Math.cos(la) * Math.sin(ln), Math.sin(la), Math.cos(la) * Math.cos(ln))
}

export default function GlobeScene(props: GlobeProps) {
  const latest = props.trips.map((e) => tripCentre(e.trip)).find(Boolean) ?? JAPAN
  const start = toVector(latest.lat, latest.lng).multiplyScalar(CAMERA_DISTANCE)
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 35, near: 0.1, far: 100, position: [start.x, start.y, start.z] }}
      gl={{ alpha: true, antialias: true }}
      fallback={<p className="absolute inset-x-0 bottom-4 text-center text-[13px] text-white/60">這個瀏覽器無法顯示地球。</p>}
    >
      <Scene {...props} />
    </Canvas>
  )
}

function Scene({ trips, onOpen, onHover }: GlobeProps) {
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])
  const light = useRef<THREE.DirectionalLight>(null)
  const { camera } = useThree()

  // The moonlight follows the camera, so whichever side you look at is lit.
  useFrame(() => {
    if (!light.current) return
    const side = new THREE.Vector3().crossVectors(camera.position, camera.up).normalize()
    light.current.position.copy(camera.position).addScaledVector(side, -1.2).addScaledVector(camera.up, 1.4)
  })

  return (
    <>
      <ambientLight intensity={0.55} color="#8fa3c8" />
      <directionalLight ref={light} intensity={1.6} color="#d6e2ff" />
      <Controls reducedMotion={reducedMotion} />
      <Earth />
      <Atmosphere />
      <Stars />
      <TripIslands trips={trips} onOpen={onOpen} onHover={onHover} reducedMotion={reducedMotion} />
    </>
  )
}

function Controls({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, gl, size } = useThree()
  const ref = useRef<OrbitControls | null>(null)

  // Back off on narrow screens so the whole globe (and its glow) fits across.
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    camera.position.setLength(CAMERA_DISTANCE * Math.max(1, 1 / aspect))
  }, [camera, size])

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    ref.current = controls
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.5
    controls.minDistance = 1.9
    controls.maxDistance = 7
    controls.zoomSpeed = 0.6
    controls.autoRotate = !reducedMotion
    controls.autoRotateSpeed = 0.35
    // Stop turning while someone is exploring; pick up again a little later.
    let timer = 0
    const pause = () => {
      window.clearTimeout(timer)
      controls.autoRotate = false
    }
    const resume = () => {
      if (reducedMotion) return
      timer = window.setTimeout(() => (controls.autoRotate = true), 5000)
    }
    controls.addEventListener('start', pause)
    controls.addEventListener('end', resume)
    return () => {
      window.clearTimeout(timer)
      controls.removeEventListener('start', pause)
      controls.removeEventListener('end', resume)
      controls.dispose()
      ref.current = null
    }
  }, [camera, gl, reducedMotion])

  useFrame(() => ref.current?.update())
  return null
}

const SEA = ['#0f1b31', '#111e36', '#0d182c', '#122039']
const LAND = ['#4f7a62', '#5a8668', '#47705c', '#628d6c', '#53805f']
const ICE = ['#9aa9b6', '#a6b4c0', '#8f9fae']

/** Low-poly sphere, each face coloured as sea, land or ice. */
function Earth() {
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 24)
    const pos = geo.getAttribute('position')
    const colors = new Float32Array(pos.count * 3)
    const rand = seeded('earth')
    const c = new THREE.Color()
    const v = new THREE.Vector3()
    for (let f = 0; f < pos.count; f += 3) {
      v.set(0, 0, 0)
      for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, f + k))
      v.normalize()
      const lat = THREE.MathUtils.radToDeg(Math.asin(v.y))
      const lng = THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z))
      const pick = (list: string[]) => list[Math.floor(rand() * list.length)]
      const land = isLand(lat, lng)
      c.set(land ? (lat > 72 || lat < -60 ? pick(ICE) : pick(LAND)) : pick(SEA))
      for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  )
}

/** Soft blue rim around the earth. */
function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color('#5d8fe0') } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 color;
          varying vec3 vNormal;
          void main() {
            float rim = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            gl_FragColor = vec4(color, 1.0) * rim;
          }`,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  return (
    <mesh scale={1.16} material={material}>
      <sphereGeometry args={[1, 48, 48]} />
    </mesh>
  )
}

function Stars() {
  const geometry = useMemo(() => {
    const rand = seeded('stars')
    const pts = new Float32Array(700 * 3)
    for (let i = 0; i < 700; i++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(25 + rand() * 15)
      v.toArray(pts, i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    return geo
  }, [])
  return (
    <points geometry={geometry}>
      <pointsMaterial color="#c9d6ff" size={0.09} sizeAttenuation transparent opacity={0.7} depthWrite={false} />
    </points>
  )
}

interface Placed {
  id: string
  dir: THREE.Vector3
  status: TripStatus
  theme: string
  phase: number
}

/** Trips close together (Tokyo, then Kyoto) are nudged apart so their islands don't overlap. */
function place(trips: SavedTrip[]): Placed[] {
  const placed: Placed[] = []
  trips.forEach((e, i) => {
    const c = tripCentre(e.trip)
    if (!c) return
    placed.push({ id: e.trip.id, dir: toVector(c.lat, c.lng), status: tripStatus(e.trip), theme: e.trip.theme, phase: i * 1.7 })
  })
  const gap = 0.12
  for (let iter = 0; iter < 60; iter++) {
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        const pa = placed[a].dir
        const pb = placed[b].dir
        const d = pa.distanceTo(pb)
        if (d >= gap) continue
        const away = d < 1e-6 ? new THREE.Vector3(1, 0, 0).cross(pa).normalize() : pb.clone().sub(pa).normalize()
        const push = (gap - d) / 2
        pa.addScaledVector(away, -push).normalize()
        pb.addScaledVector(away, push).normalize()
      }
    }
  }
  return placed
}

function TripIslands({ trips, onOpen, onHover, reducedMotion }: GlobeProps & { reducedMotion: boolean }) {
  const placed = useMemo(() => place(trips), [trips])
  return (
    <>
      {placed.map((p) => (
        <MiniIsland key={p.id} placed={p} onOpen={onOpen} onHover={onHover} reducedMotion={reducedMotion} />
      ))}
    </>
  )
}

function glowTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,236,190,0.9)')
  g.addColorStop(0.4, 'rgba(255,210,140,0.35)')
  g.addColorStop(1, 'rgba(255,200,120,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}
let glow: THREE.Texture | null = null

function MiniIsland({
  placed,
  onOpen,
  onHover,
  reducedMotion,
}: {
  placed: Placed
  onOpen: (id: string) => void
  onHover: (id: string | null) => void
  reducedMotion: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const pal = palette3d(placed.theme)
  const built = placed.status === 'built'
  const opacity = built ? 1 : 0.55
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), placed.dir), [placed.dir])
  glow ??= glowTexture()

  useFrame(({ clock }) => {
    if (!group.current) return
    const lift = 1.03 + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 1.2 + placed.phase) * 0.006)
    group.current.position.copy(placed.dir).multiplyScalar(lift)
  })

  const mat = (color: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) => (
    <meshStandardMaterial color={color} flatShading transparent={!built} opacity={opacity} {...extra} />
  )

  return (
    <group
      ref={group}
      quaternion={quaternion}
      scale={1.8}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 6) return // that was a drag to spin the globe
        e.stopPropagation()
        onOpen(placed.id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        onHover(placed.id)
      }}
      onPointerOut={() => {
        document.body.style.cursor = ''
        onHover(null)
      }}
    >
      {/* rock underside and grass top */}
      <mesh position={[0, -0.012, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.042, 0.06, 7]} />
        {mat(pal.rock)}
      </mesh>
      <mesh position={[0, 0.022, 0]}>
        <cylinderGeometry args={[0.044, 0.042, 0.012, 7]} />
        {mat(pal.grass)}
      </mesh>
      <mesh position={[0.016, 0.04, -0.012]}>
        <coneGeometry args={[0.011, 0.03, 5]} />
        {mat(pal.leaves[0])}
      </mesh>
      <mesh position={[-0.02, 0.036, 0.008]}>
        <coneGeometry args={[0.009, 0.024, 5]} />
        {mat(pal.leaves[pal.leaves.length - 1])}
      </mesh>
      <group position={[-0.002, 0.028, 0.016]}>
        <mesh position={[0, 0.007, 0]}>
          <boxGeometry args={[0.016, 0.014, 0.014]} />
          {mat(pal.wall)}
        </mesh>
        <mesh position={[0, 0.019, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[0.014, 0.011, 4]} />
          {mat(pal.roof, built ? { emissive: pal.roof, emissiveIntensity: 0.25 } : undefined)}
        </mesh>
      </group>

      {built ? (
        <sprite position={[0, 0.03, 0]} scale={[0.2, 0.2, 0.2]} raycast={() => null}>
          <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
        </sprite>
      ) : (
        // Under construction: a flag planted in the middle, scaffold poles at the corners.
        <>
          <mesh position={[0.004, 0.06, 0]}>
            <cylinderGeometry args={[0.0018, 0.0018, 0.07, 4]} />
            <meshStandardMaterial color="#e9edf5" />
          </mesh>
          <mesh position={[0.016, 0.087, 0]}>
            <boxGeometry args={[0.024, 0.014, 0.002]} />
            <meshStandardMaterial color={pal.accent} emissive={pal.accent} emissiveIntensity={0.5} />
          </mesh>
          {[0, 2, 4].map((k) => {
            const a = (k / 7) * Math.PI * 2
            return (
              <mesh key={k} position={[Math.cos(a) * 0.036, 0.042, Math.sin(a) * 0.036]}>
                <boxGeometry args={[0.003, 0.03, 0.003]} />
                <meshStandardMaterial color="#d8c39a" />
              </mesh>
            )
          })}
        </>
      )}
      {/* A larger invisible target, so the tiny island is easy to tap. */}
      <mesh position={[0, 0.03, 0]} visible={false}>
        <sphereGeometry args={[0.07, 8, 8]} />
      </mesh>
    </group>
  )
}
