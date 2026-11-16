// Low-poly landmarks for well-known places (see cities.ts). Each is about one
// unit across, stands on y = 0 and faces +z. Simplified, original shapes in
// the spirit of each place; no logos or mascots.
import { createContext, useContext, type ReactNode } from 'react'
import { Shape, Vector2 } from 'three'
import type { LandmarkKind } from './cities'

type V3 = [number, number, number]

const OpacityCtx = createContext(1)

const C = {
  red: '#d2452f',
  white: '#f6f4ee',
  stone: '#b9b3a8',
  stoneDark: '#8f897e',
  tile: '#3f4652',
  wood: '#8a5a3c',
  gold: '#e2b54a',
  green: '#4f8a52',
  water: '#7fb8cf',
  snow: '#ffffff',
  rock: '#7c6f68',
  glass: '#9ccbe0',
  bronze: '#6f7d6a',
}

function M({ c, glow = 0 }: { c: string; glow?: number }) {
  const opacity = useContext(OpacityCtx)
  return (
    <meshStandardMaterial
      color={c}
      flatShading
      transparent={opacity < 1}
      opacity={opacity}
      emissive={glow ? c : '#000000'}
      emissiveIntensity={glow}
    />
  )
}
function Box({ p, s, c, r = [0, 0, 0], glow }: { p: V3; s: V3; c: string; r?: V3; glow?: number }) {
  return (
    <mesh position={p} rotation={r}>
      <boxGeometry args={s} />
      <M c={c} glow={glow} />
    </mesh>
  )
}
function Cyl({ p, rt, rb, h, c, seg = 8, r = [0, 0, 0] }: { p: V3; rt: number; rb: number; h: number; c: string; seg?: number; r?: V3 }) {
  return (
    <mesh position={p} rotation={r}>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <M c={c} />
    </mesh>
  )
}
/** Four-sided roof, square to the walls. */
function Hip({ p, w, h, c }: { p: V3; w: number; h: number; c: string }) {
  return (
    <mesh position={p} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[w * 0.72, h, 4]} />
      <M c={c} />
    </mesh>
  )
}
function Ball({ p, r, c, s = [1, 1, 1], detail = 0 }: { p: V3; r: number; c: string; s?: V3; detail?: number }) {
  return (
    <mesh position={p} scale={s}>
      <icosahedronGeometry args={[r, detail]} />
      <M c={c} />
    </mesh>
  )
}

/** A red-and-white lattice broadcasting tower. */
function Tower() {
  const bands = [0, 1, 2, 3, 4]
  return (
    <>
      {bands.map((b) => {
        const y0 = b * 0.32
        const w0 = 0.42 - b * 0.075
        return (
          <mesh key={b} position={[0, y0 + 0.16, 0]} rotation={[0, Math.PI / 4, 0]}>
            <cylinderGeometry args={[(w0 - 0.075) * 0.72, w0 * 0.72, 0.32, 4, 1, true]} />
            <M c={b % 2 ? C.white : C.red} />
          </mesh>
        )
      })}
      <Box p={[0, 0.62, 0]} s={[0.36, 0.06, 0.36]} c={C.white} />
      <Box p={[0, 1.08, 0]} s={[0.2, 0.05, 0.2]} c={C.white} />
      <Cyl p={[0, 1.75, 0]} rt={0.008} rb={0.03} h={0.5} c={C.red} seg={4} />
    </>
  )
}

/** A five-storey pagoda. */
function Pagoda() {
  return (
    <>
      <Box p={[0, 0.05, 0]} s={[0.6, 0.1, 0.6]} c={C.stone} />
      {[0, 1, 2, 3, 4].map((t) => {
        const y = 0.1 + t * 0.27
        const w = 0.36 - t * 0.04
        return (
          <group key={t}>
            <Box p={[0, y + 0.09, 0]} s={[w, 0.18, w]} c={C.red} />
            <Hip p={[0, y + 0.22, 0]} w={w + 0.24} h={0.1} c={C.tile} />
          </group>
        )
      })}
      <Cyl p={[0, 1.6, 0]} rt={0.01} rb={0.02} h={0.32} c={C.gold} seg={5} />
    </>
  )
}

/** A Japanese castle keep on a stone base; gold fish ornaments if `gold`. */
function Castle({ gold = false }: { gold?: boolean }) {
  return (
    <>
      <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0.42, 0.56, 0.32, 4]} />
        <M c={C.stone} />
      </mesh>
      <Box p={[0, 0.44, 0]} s={[0.56, 0.24, 0.46]} c={C.white} />
      <Hip p={[0, 0.62, 0]} w={0.78} h={0.16} c={gold ? '#3c5a52' : C.tile} />
      <Box p={[0, 0.78, 0]} s={[0.4, 0.2, 0.32]} c={C.white} />
      <Hip p={[0, 0.94, 0]} w={0.58} h={0.14} c={gold ? '#3c5a52' : C.tile} />
      <Box p={[0, 1.07, 0]} s={[0.26, 0.16, 0.2]} c={C.white} />
      <Hip p={[0, 1.22, 0]} w={0.4} h={0.16} c={gold ? '#3c5a52' : C.tile} />
      {gold && (
        <>
          <Box p={[-0.1, 1.33, 0]} s={[0.05, 0.09, 0.04]} c={C.gold} glow={0.3} />
          <Box p={[0.1, 1.33, 0]} s={[0.05, 0.09, 0.04]} c={C.gold} glow={0.3} />
        </>
      )}
      {[-0.16, 0, 0.16].map((x) => (
        <Box key={x} p={[x, 0.44, 0.232]} s={[0.06, 0.08, 0.005]} c={C.tile} />
      ))}
    </>
  )
}

/** A great wooden temple hall, with a deer nearby. */
function GreatHall() {
  return (
    <>
      <Box p={[0, 0.06, 0]} s={[1.0, 0.12, 0.7]} c={C.stone} />
      <Box p={[0, 0.3, 0]} s={[0.84, 0.36, 0.54]} c={C.wood} />
      <Hip p={[0, 0.58, 0]} w={1.15} h={0.22} c={C.tile} />
      <Box p={[0, 0.68, 0]} s={[0.6, 0.12, 0.34]} c={C.wood} />
      <Hip p={[0, 0.84, 0]} w={0.86} h={0.22} c={C.tile} />
      <Box p={[-0.48, 0.97, 0]} s={[0.05, 0.08, 0.04]} c={C.gold} />
      <Box p={[0.48, 0.97, 0]} s={[0.05, 0.08, 0.04]} c={C.gold} />
      {/* deer */}
      <group position={[0.42, 0.12, 0.52]} rotation={[0, -0.6, 0]}>
        <Box p={[0, 0.14, 0]} s={[0.2, 0.09, 0.08]} c="#b8875a" />
        {[-0.07, 0.07].flatMap((x) => [-0.025, 0.025].map((z) => <Box key={`${x}${z}`} p={[x, 0.05, z]} s={[0.02, 0.1, 0.02]} c="#8c6340" />))}
        <Box p={[0.12, 0.22, 0]} s={[0.06, 0.08, 0.05]} c="#b8875a" />
      </group>
    </>
  )
}

/** A white wooden clock tower with a red roof. */
function ClockTower() {
  return (
    <>
      <Box p={[0, 0.22, 0]} s={[0.7, 0.44, 0.46]} c={C.white} />
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.5, 0.18, 4]} />
        <M c={C.red} />
      </mesh>
      <Box p={[0, 0.72, 0]} s={[0.24, 0.36, 0.24]} c={C.white} />
      <Cyl p={[0, 0.76, 0.125]} rt={0.08} rb={0.08} h={0.01} c="#2f3540" seg={16} r={[Math.PI / 2, 0, 0]} />
      <Cyl p={[0, 0.76, 0.131]} rt={0.065} rb={0.065} h={0.01} c={C.white} seg={16} r={[Math.PI / 2, 0, 0]} />
      <Hip p={[0, 0.98, 0]} w={0.32} h={0.18} c={C.red} />
      <Cyl p={[0, 1.12, 0]} rt={0.008} rb={0.008} h={0.12} c={C.tile} seg={4} />
    </>
  )
}

function starPoints(r1: number, r2: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? r2 : r1
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}

function Star({ r1, r2, y, h, c }: { r1: number; r2: number; y: number; h: number; c: string }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <extrudeGeometry args={[shapeFrom(starPoints(r1, r2)), { depth: h, bevelEnabled: false }]} />
      <M c={c} />
    </mesh>
  )
}

/** A star-shaped fort with a moat and a lookout tower. */
function StarFort() {
  return (
    <>
      <Star r1={0.62} r2={0.4} y={0.005} h={0.02} c={C.water} />
      <Star r1={0.52} r2={0.33} y={0.02} h={0.06} c={C.green} />
      <Box p={[0, 0.09, 0]} s={[0.16, 0.06, 0.12]} c={C.white} />
      {/* lookout tower beside the fort */}
      <group position={[0.62, 0, -0.42]}>
        <Cyl p={[0, 0.45, 0]} rt={0.05} rb={0.09} h={0.9} c={C.white} seg={6} />
        <Cyl p={[0, 0.95, 0]} rt={0.13} rb={0.09} h={0.14} c={C.glass} seg={6} />
        <Cyl p={[0, 1.04, 0]} rt={0.02} rb={0.13} h={0.06} c={C.white} seg={6} />
      </group>
    </>
  )
}

function shapeFrom(points: [number, number][]): Shape {
  return new Shape(points.map(([x, y]) => new Vector2(x, y)))
}

/** A great glowing festival lantern float. */
function Nebuta() {
  return (
    <>
      <Box p={[0, 0.08, 0]} s={[0.9, 0.16, 0.5]} c={C.wood} />
      <Box p={[0, 0.36, 0]} s={[0.7, 0.4, 0.4]} c="#2f6fa8" glow={0.25} />
      <Ball p={[0.1, 0.72, 0.02]} r={0.22} c="#f7ebd7" s={[1, 1.1, 0.9]} detail={1} />
      <Box p={[0.1, 0.86, 0.06]} s={[0.3, 0.08, 0.22]} c="#1e1a17" />
      <Box p={[0.04, 0.73, 0.21]} s={[0.07, 0.02, 0.01]} c={C.red} />
      <Box p={[0.16, 0.73, 0.21]} s={[0.07, 0.02, 0.01]} c={C.red} />
      <Box p={[-0.26, 0.62, 0]} s={[0.06, 0.5, 0.06]} c={C.red} r={[0, 0, 0.5]} />
      <Box p={[0.34, 0.5, 0]} s={[0.36, 0.06, 0.06]} c={C.gold} glow={0.3} r={[0, 0, -0.3]} />
      <mesh position={[0.05, 0.5, 0]}>
        <sphereGeometry args={[0.62, 12, 8]} />
        <meshBasicMaterial color="#ffd98a" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </>
  )
}

/** A two-legged stone garden lantern by a pond. */
function GardenLantern() {
  return (
    <>
      <mesh position={[0.05, 0.01, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 10]} />
        <M c={C.water} />
      </mesh>
      <Cyl p={[-0.12, 0.24, 0]} rt={0.025} rb={0.03} h={0.48} c={C.stoneDark} seg={5} r={[0, 0, 0.12]} />
      <Cyl p={[0.12, 0.2, 0]} rt={0.025} rb={0.03} h={0.4} c={C.stoneDark} seg={5} r={[0, 0, -0.08]} />
      <Box p={[0, 0.5, 0]} s={[0.24, 0.16, 0.24]} c={C.stone} />
      <Box p={[0, 0.5, 0.122]} s={[0.1, 0.08, 0.005]} c={C.gold} glow={0.5} />
      <Hip p={[0, 0.64, 0]} w={0.5} h={0.14} c={C.stoneDark} />
      <Ball p={[0, 0.74, 0]} r={0.04} c={C.stone} />
      <Ball p={[-0.36, 0.14, -0.18]} r={0.16} c={C.green} />
      <Ball p={[0.38, 0.12, -0.24]} r={0.13} c={C.green} />
    </>
  )
}

/** A snow-capped volcano. */
function Fuji() {
  return (
    <>
      <mesh position={[0, 0.45, 0]}>
        <coneGeometry args={[0.7, 0.9, 9]} />
        <M c="#5b6e86" />
      </mesh>
      <mesh position={[0, 0.74, 0]}>
        <coneGeometry args={[0.29, 0.34, 9]} />
        <M c={C.snow} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3]} rotation={[0, -a, 0.35]}>
            <coneGeometry args={[0.05, 0.16, 3]} />
            <M c={C.snow} />
          </mesh>
        )
      })}
    </>
  )
}

/** A seated great Buddha, simplified. */
function Buddha() {
  return (
    <>
      <Box p={[0, 0.06, 0]} s={[0.8, 0.12, 0.6]} c={C.stone} />
      <Ball p={[0, 0.3, 0.02]} r={0.32} c={C.bronze} s={[1.15, 0.6, 0.85]} detail={1} />
      <Ball p={[0, 0.58, 0]} r={0.2} c={C.bronze} s={[0.95, 1.15, 0.85]} detail={1} />
      <Ball p={[0, 0.88, 0]} r={0.13} c={C.bronze} detail={1} />
      <Ball p={[0, 1.0, -0.01]} r={0.08} c={C.bronze} detail={1} />
      <Box p={[0, 0.42, 0.24]} s={[0.22, 0.05, 0.08]} c={C.bronze} />
    </>
  )
}

/** A vermilion gate standing in the sea. */
function SeaTorii() {
  return (
    <>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.6, 12]} />
        <M c={C.water} />
      </mesh>
      {[-0.26, 0.26].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0.42, 0]} rt={0.045} rb={0.055} h={0.84} c={C.red} seg={8} />
          {/* the smaller supporting legs, in front of and behind each main pillar */}
          <Cyl p={[x, 0.24, 0.16]} rt={0.025} rb={0.03} h={0.48} c={C.red} seg={6} />
          <Cyl p={[x, 0.24, -0.16]} rt={0.025} rb={0.03} h={0.48} c={C.red} seg={6} />
          <Box p={[x, 0.42, 0]} s={[0.03, 0.03, 0.34]} c={C.red} />
        </group>
      ))}
      <Box p={[0, 0.66, 0]} s={[0.7, 0.05, 0.06]} c={C.red} />
      <Box p={[0, 0.82, 0]} s={[0.92, 0.07, 0.09]} c={C.red} />
      <Box p={[0, 0.88, 0]} s={[0.98, 0.04, 0.1]} c={C.tile} />
      <Box p={[0, 0.74, 0.02]} s={[0.1, 0.12, 0.02]} c={C.tile} />
    </>
  )
}

/** A slim glass harbour tower, with a food stall at its foot. */
function HarbourTower() {
  return (
    <>
      <mesh position={[0, 0.8, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 1.6, 3]} />
        <M c={C.glass} />
      </mesh>
      <Box p={[0, 1.15, 0]} s={[0.3, 0.12, 0.3]} c={C.white} />
      <Cyl p={[0, 1.75, 0]} rt={0.008} rb={0.02} h={0.3} c={C.white} seg={4} />
      {/* food stall */}
      <group position={[0.45, 0, 0.3]}>
        <Box p={[0, 0.1, 0]} s={[0.32, 0.2, 0.2]} c={C.wood} />
        <Box p={[0, 0.3, 0.02]} s={[0.36, 0.03, 0.26]} c={C.red} r={[0.25, 0, 0]} />
        <Ball p={[0.14, 0.26, 0.12]} r={0.035} c={C.red} />
        <Ball p={[-0.14, 0.26, 0.12]} r={0.035} c={C.red} />
      </group>
    </>
  )
}

function Lion({ x, flip }: { x: number; flip: boolean }) {
  return (
    <group position={[x, 0.42, 0.04]} scale={[flip ? -1 : 1, 1, 1]}>
      <Ball p={[0, 0.08, 0]} r={0.12} c="#c98a4b" s={[1, 1, 1.1]} />
      <Ball p={[0.02, 0.24, 0.06]} r={0.11} c="#c98a4b" />
      <Ball p={[0.02, 0.27, 0.06]} r={0.13} c="#a4652f" s={[1.1, 0.9, 0.6]} />
      <Box p={[0.03, 0.2, 0.15]} s={[0.1, 0.04, 0.03]} c={C.white} />
    </group>
  )
}

/** A pair of guardian lions on a red-tiled gate. */
function Shisa() {
  return (
    <>
      <Box p={[-0.32, 0.2, 0]} s={[0.24, 0.4, 0.24]} c={C.white} />
      <Box p={[0.32, 0.2, 0]} s={[0.24, 0.4, 0.24]} c={C.white} />
      <Box p={[0, 0.06, 0]} s={[0.9, 0.12, 0.34]} c={C.stone} />
      <Lion x={-0.32} flip={false} />
      <Lion x={0.32} flip={true} />
      <Hip p={[0, 0.98, -0.25]} w={0.7} h={0.24} c="#c4553a" />
      <Box p={[0, 0.76, -0.25]} s={[0.5, 0.2, 0.36]} c={C.white} />
    </>
  )
}

const MODELS: Record<LandmarkKind, () => ReactNode> = {
  tower: Tower,
  pagoda: Pagoda,
  castle: () => <Castle />,
  goldCastle: () => <Castle gold />,
  greatHall: GreatHall,
  clockTower: ClockTower,
  starFort: StarFort,
  nebuta: Nebuta,
  gardenLantern: GardenLantern,
  fuji: Fuji,
  buddha: Buddha,
  seaTorii: SeaTorii,
  harbourTower: HarbourTower,
  shisa: Shisa,
}

export function Landmark({ kind, opacity = 1 }: { kind: LandmarkKind; opacity?: number }) {
  const Model = MODELS[kind]
  return (
    <OpacityCtx.Provider value={opacity}>
      <Model />
    </OpacityCtx.Provider>
  )
}
