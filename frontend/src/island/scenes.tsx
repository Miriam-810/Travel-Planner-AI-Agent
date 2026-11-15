// Little low-poly scenes, one per stop, standing on the day's islet. Each fits
// in roughly a 0.6 × 0.6 footprint, sits on y = 0 and faces +z (the camera).
import { useFrame } from '@react-three/fiber'
import { createContext, useContext, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { SceneKind } from '../types'
import type { Palette3D } from './palette3d'

type V3 = [number, number, number]

interface Look {
  opacity: number
  reducedMotion: boolean
}
const LookCtx = createContext<Look>({ opacity: 1, reducedMotion: false })

const C = {
  vermilion: '#d2452f',
  wood: '#9a6b47',
  woodDark: '#6f4c35',
  tile: '#4a4f5a',
  stone: '#b9b3a8',
  stoneDark: '#948d82',
  navy: '#2f4b6e',
  lantern: '#d8433a',
  cream: '#f4ead6',
  glass: '#bfdbe6',
  sand: '#f1dfb0',
  gold: '#e2b54a',
  brick: '#b5583f',
  steam: '#ffffff',
}

function M({ c, glow = 0 }: { c: string; glow?: number }) {
  const { opacity } = useContext(LookCtx)
  return (
    <meshStandardMaterial
      color={c}
      flatShading
      transparent
      opacity={opacity}
      emissive={glow ? c : '#000000'}
      emissiveIntensity={glow}
    />
  )
}

function Box({ p, s, c, r = [0, 0, 0], glow }: { p: V3; s: V3; c: string; r?: V3; glow?: number }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={s} />
      <M c={c} glow={glow} />
    </mesh>
  )
}

function Cyl({ p, rt, rb, h, c, seg = 8, r = [0, 0, 0], glow }: { p: V3; rt: number; rb: number; h: number; c: string; seg?: number; r?: V3; glow?: number }) {
  return (
    <mesh position={p} rotation={r} castShadow>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <M c={c} glow={glow} />
    </mesh>
  )
}

/** Four-sided pyramid roof, square to the walls. */
function Hip({ p, w, h, c }: { p: V3; w: number; h: number; c: string }) {
  return (
    <mesh position={p} rotation={[0, Math.PI / 4, 0]} castShadow>
      <coneGeometry args={[w * 0.72, h, 4]} />
      <M c={c} />
    </mesh>
  )
}

/** Pitched roof with the ridge running left–right. */
function Gable({ p, w, d, h, c }: { p: V3; w: number; d: number; h: number; c: string }) {
  const slope = Math.hypot(d / 2, h)
  const angle = Math.atan2(h, d / 2)
  return (
    <group position={p}>
      <Box p={[0, h / 2, d / 4]} s={[w, 0.035, slope]} r={[angle, 0, 0]} c={c} />
      <Box p={[0, h / 2, -d / 4]} s={[w, 0.035, slope]} r={[-angle, 0, 0]} c={c} />
    </group>
  )
}

function Ball({ p, rad, c, s = [1, 1, 1], glow }: { p: V3; rad: number; c: string; s?: V3; glow?: number }) {
  return (
    <mesh position={p} scale={s} castShadow>
      <icosahedronGeometry args={[rad, 0]} />
      <M c={c} glow={glow} />
    </mesh>
  )
}

/** A small Japanese shop: walls, roof, a noren curtain over the door. */
function Shopfront({ wall, roof, noren, width = 0.5 }: { wall: string; roof: string; noren: string; width?: number }) {
  return (
    <>
      <Box p={[0, 0.17, 0]} s={[width, 0.34, 0.4]} c={wall} />
      <Gable p={[0, 0.34, 0]} w={width + 0.1} d={0.5} h={0.16} c={roof} />
      <Box p={[0, 0.11, 0.202]} s={[0.16, 0.22, 0.01]} c={C.woodDark} />
      <Box p={[0, 0.25, 0.21]} s={[0.24, 0.08, 0.012]} c={noren} />
    </>
  )
}

function Steam({ p, count = 3 }: { p: V3; count?: number }) {
  const group = useRef<THREE.Group>(null)
  const { reducedMotion, opacity } = useContext(LookCtx)
  useFrame(({ clock }) => {
    if (!group.current) return
    group.current.children.forEach((puff, i) => {
      const t = reducedMotion ? i / count : (clock.elapsedTime * 0.35 + i / count) % 1
      puff.position.y = t * 0.45
      puff.scale.setScalar(0.6 + t * 0.8)
      const mat = (puff as THREE.Mesh).material as THREE.MeshStandardMaterial
      mat.opacity = (1 - t) * 0.75 * opacity
    })
  })
  return (
    <group ref={group} position={p}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[(i - 1) * 0.05, 0, 0]}>
          <icosahedronGeometry args={[0.06, 0]} />
          <meshStandardMaterial color={C.steam} flatShading transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Ramen({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Shopfront wall={pal.wall} roof={C.tile} noren={C.lantern} />
      <Cyl p={[0.2, 0.26, 0.24]} rt={0.045} rb={0.045} h={0.11} c={C.lantern} glow={0.35} />
      {/* a bowl of noodles on the roof as the sign */}
      <Cyl p={[0, 0.58, 0.04]} rt={0.13} rb={0.08} h={0.09} c={C.cream} seg={10} />
      <Cyl p={[0, 0.625, 0.04]} rt={0.115} rb={0.115} h={0.01} c="#e8b768" seg={10} />
      <Steam p={[0, 0.66, 0.04]} />
    </>
  )
}

function Seafood({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Shopfront wall={pal.wall} roof={C.tile} noren={C.navy} />
      {/* fish sign */}
      <group position={[0, 0.6, 0.04]}>
        <Ball p={[0, 0, 0]} rad={0.1} s={[1.6, 0.75, 0.45]} c="#7fa6c4" />
        <mesh position={[-0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.07, 0.1, 4]} />
          <M c="#7fa6c4" />
        </mesh>
      </group>
      <Box p={[0.2, 0.06, 0.25]} s={[0.14, 0.1, 0.1]} c={C.wood} />
      <Ball p={[0.2, 0.13, 0.25]} rad={0.04} s={[1.4, 0.6, 1]} c="#e88a6a" />
    </>
  )
}

function Cafe({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Box p={[0, 0.18, -0.05]} s={[0.46, 0.36, 0.34]} c={C.cream} />
      <Box p={[0, 0.375, -0.05]} s={[0.5, 0.03, 0.38]} c={C.woodDark} />
      <Box p={[0, 0.18, 0.122]} s={[0.24, 0.16, 0.01]} c={C.glass} glow={0.15} />
      {[-0.16, -0.08, 0, 0.08, 0.16].map((x, i) => (
        <Box key={x} p={[x, 0.31, 0.17]} s={[0.08, 0.02, 0.12]} r={[0.45, 0, 0]} c={i % 2 ? pal.wall : pal.accent} />
      ))}
      {/* table and parasol */}
      <Cyl p={[0.22, 0.08, 0.26]} rt={0.012} rb={0.012} h={0.16} c={C.woodDark} seg={5} />
      <Cyl p={[0.22, 0.16, 0.26]} rt={0.07} rb={0.07} h={0.015} c={pal.wall} />
      <Cyl p={[0.22, 0.28, 0.26]} rt={0.006} rb={0.006} h={0.25} c={C.woodDark} seg={4} />
      <mesh position={[0.22, 0.4, 0.26]} castShadow>
        <coneGeometry args={[0.13, 0.07, 8]} />
        <M c={pal.accent} />
      </mesh>
    </>
  )
}

function Restaurant({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Shopfront wall={pal.wall} roof={pal.roof} noren={pal.accent} width={0.54} />
      <Ball p={[-0.2, 0.27, 0.24]} rad={0.045} s={[1, 1.3, 1]} c={C.cream} glow={0.3} />
      <Ball p={[0.2, 0.27, 0.24]} rad={0.045} s={[1, 1.3, 1]} c={C.cream} glow={0.3} />
      <Box p={[0, 0.5, 0.02]} s={[0.22, 0.09, 0.02]} c={C.woodDark} />
    </>
  )
}

function Torii({ p, scale = 1 }: { p: V3; scale?: number }) {
  return (
    <group position={p} scale={scale}>
      <Cyl p={[-0.13, 0.17, 0]} rt={0.018} rb={0.022} h={0.34} c={C.vermilion} seg={6} />
      <Cyl p={[0.13, 0.17, 0]} rt={0.018} rb={0.022} h={0.34} c={C.vermilion} seg={6} />
      <Box p={[0, 0.27, 0]} s={[0.3, 0.025, 0.03]} c={C.vermilion} />
      <Box p={[0, 0.345, 0]} s={[0.4, 0.035, 0.045]} c={C.tile} />
    </group>
  )
}

function Shrine() {
  return (
    <>
      <Box p={[0, 0.03, -0.1]} s={[0.4, 0.06, 0.32]} c={C.stone} />
      <Box p={[0, 0.17, -0.1]} s={[0.3, 0.22, 0.24]} c={C.wood} />
      <Gable p={[0, 0.28, -0.1]} w={0.42} d={0.38} h={0.17} c={C.tile} />
      <Box p={[0, 0.15, 0.022]} s={[0.12, 0.14, 0.01]} c={C.vermilion} />
      <Torii p={[0, 0, 0.22]} scale={0.95} />
    </>
  )
}

function Temple() {
  // A three-storey pagoda.
  const tiers = [0, 1, 2]
  return (
    <>
      <Box p={[0, 0.03, 0]} s={[0.34, 0.06, 0.34]} c={C.stone} />
      {tiers.map((t) => {
        const y = 0.06 + t * 0.17
        const w = 0.22 - t * 0.035
        return (
          <group key={t}>
            <Box p={[0, y + 0.06, 0]} s={[w, 0.12, w]} c={C.vermilion} />
            <Hip p={[0, y + 0.15, 0]} w={w + 0.16} h={0.08} c={C.tile} />
          </group>
        )
      })}
      <Cyl p={[0, 0.7, 0]} rt={0.008} rb={0.012} h={0.2} c={C.gold} seg={5} />
    </>
  )
}

function Castle() {
  return (
    <>
      <mesh position={[0, 0.09, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.27, 0.36, 0.18, 4]} />
        <M c={C.stone} />
      </mesh>
      <Box p={[0, 0.25, 0]} s={[0.34, 0.14, 0.28]} c="#f7f4ee" />
      <Hip p={[0, 0.36, 0]} w={0.46} h={0.1} c="#4d5b63" />
      <Box p={[0, 0.44, 0]} s={[0.22, 0.12, 0.18]} c="#f7f4ee" />
      <Gable p={[0, 0.5, 0]} w={0.28} d={0.26} h={0.13} c="#4d5b63" />
      <Box p={[-0.08, 0.66, 0]} s={[0.025, 0.04, 0.02]} c={C.gold} />
      <Box p={[0.08, 0.66, 0]} s={[0.025, 0.04, 0.02]} c={C.gold} />
      {[-0.08, 0, 0.08].map((x) => (
        <Box key={x} p={[x, 0.26, 0.142]} s={[0.035, 0.04, 0.005]} c={C.tile} />
      ))}
    </>
  )
}

function Onsen({ pal }: { pal: Palette3D }) {
  const rocks = Array.from({ length: 9 }, (_, i) => (i / 9) * Math.PI * 2)
  return (
    <>
      <mesh position={[0, 0.025, 0.02]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 1, 1]}>
        <circleGeometry args={[0.2, 9]} />
        <M c="#a8dde6" glow={0.15} />
      </mesh>
      {rocks.map((a) => (
        <Ball key={a} p={[Math.cos(a) * 0.26, 0.04, 0.02 + Math.sin(a) * 0.21]} rad={0.055} s={[1.2, 0.8, 1]} c={C.stoneDark} />
      ))}
      <Steam p={[-0.06, 0.08, 0.02]} count={4} />
      <Box p={[0.16, 0.2, -0.24]} s={[0.24, 0.02, 0.14]} c={pal.roof} r={[0.3, 0, 0]} />
      <Cyl p={[0.06, 0.1, -0.2]} rt={0.012} rb={0.012} h={0.2} c={C.wood} seg={4} />
      <Cyl p={[0.26, 0.1, -0.2]} rt={0.012} rb={0.012} h={0.2} c={C.wood} seg={4} />
    </>
  )
}

function Museum({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Box p={[0, 0.025, 0.04]} s={[0.54, 0.05, 0.46]} c={C.stone} />
      <Box p={[0, 0.17, -0.05]} s={[0.46, 0.24, 0.26]} c={pal.wall} />
      {[-0.18, -0.06, 0.06, 0.18].map((x) => (
        <Cyl key={x} p={[x, 0.17, 0.13]} rt={0.022} rb={0.022} h={0.24} c={pal.wall} seg={6} />
      ))}
      <Box p={[0, 0.3, 0.03]} s={[0.5, 0.03, 0.4]} c={C.stone} />
      <Gable p={[0, 0.315, 0.03]} w={0.5} d={0.42} h={0.1} c={pal.roof} />
      <Box p={[0, 0.03, 0.27]} s={[0.3, 0.03, 0.06]} c={C.stoneDark} />
    </>
  )
}

function Park({ pal }: { pal: Palette3D }) {
  return (
    <>
      {/* stone lantern */}
      <group position={[-0.16, 0, -0.08]}>
        <Cyl p={[0, 0.03, 0]} rt={0.06} rb={0.07} h={0.06} c={C.stone} seg={6} />
        <Cyl p={[0, 0.13, 0]} rt={0.025} rb={0.03} h={0.14} c={C.stone} seg={6} />
        <Box p={[0, 0.24, 0]} s={[0.09, 0.08, 0.09]} c={C.stone} />
        <Box p={[0, 0.24, 0.046]} s={[0.04, 0.04, 0.005]} c={C.gold} glow={0.5} />
        <Hip p={[0, 0.31, 0]} w={0.16} h={0.07} c={C.stoneDark} />
      </group>
      {/* bench */}
      <Box p={[0.1, 0.09, 0.14]} s={[0.24, 0.025, 0.08]} c={C.wood} />
      <Box p={[0.1, 0.15, 0.1]} s={[0.24, 0.07, 0.015]} c={C.wood} />
      <Box p={[0.0, 0.04, 0.14]} s={[0.02, 0.08, 0.06]} c={C.woodDark} />
      <Box p={[0.2, 0.04, 0.14]} s={[0.02, 0.08, 0.06]} c={C.woodDark} />
      {/* shrubs with flowers */}
      <Ball p={[0.16, 0.1, -0.14]} rad={0.12} c={pal.leaves[0]} />
      <Ball p={[0.24, 0.17, -0.1]} rad={0.03} c={pal.accent} />
      <Ball p={[0.08, 0.17, -0.08]} rad={0.03} c={C.gold} />
      <Ball p={[-0.02, 0.07, 0.24]} rad={0.07} c={pal.leaves[pal.leaves.length - 1]} />
    </>
  )
}

function Nature({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Ball p={[-0.12, 0.2, -0.1]} rad={0.24} s={[1, 1.1, 0.8]} c={pal.rock} />
      <Ball p={[0.16, 0.14, -0.08]} rad={0.19} s={[1, 1, 0.8]} c={pal.rockDark} />
      {/* waterfall into a little pool */}
      <Box p={[0.03, 0.2, 0.06]} s={[0.09, 0.32, 0.02]} c="#d8eef4" glow={0.2} />
      <mesh position={[0.03, 0.02, 0.17]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 8]} />
        <M c={pal.water} />
      </mesh>
      <mesh position={[0.24, 0.16, 0.16]} castShadow>
        <coneGeometry args={[0.08, 0.24, 6]} />
        <M c={pal.leaves[0]} />
      </mesh>
      <mesh position={[-0.26, 0.13, 0.14]} castShadow>
        <coneGeometry args={[0.07, 0.2, 6]} />
        <M c={pal.leaves[1 % pal.leaves.length]} />
      </mesh>
    </>
  )
}

function Viewpoint({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Ball p={[0, 0.02, 0]} rad={0.26} s={[1.1, 0.35, 1]} c={pal.grassEdge} />
      <mesh position={[0, 0.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.11, 0.5, 4]} />
        <M c={pal.wall} />
      </mesh>
      <Cyl p={[0, 0.57, 0]} rt={0.1} rb={0.07} h={0.08} c={C.glass} glow={0.2} />
      <Cyl p={[0, 0.62, 0]} rt={0.11} rb={0.11} h={0.02} c={pal.accent} />
      <Cyl p={[0, 0.72, 0]} rt={0.005} rb={0.012} h={0.18} c={pal.accent} seg={4} />
      <Box p={[0, 0.2, 0]} s={[0.17, 0.03, 0.17]} c={pal.accent} />
    </>
  )
}

function Beach({ pal }: { pal: Palette3D }) {
  return (
    <>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 9]} />
        <M c={C.sand} />
      </mesh>
      <mesh position={[0.02, 0.022, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.2, 9, Math.PI, Math.PI]} />
        <M c={pal.water} />
      </mesh>
      {/* boat */}
      <group position={[0.08, 0.04, 0.18]} rotation={[0, 0.4, 0]}>
        <Box p={[0, 0.02, 0]} s={[0.18, 0.05, 0.07]} c={pal.wall} />
        <Cyl p={[0, 0.12, 0]} rt={0.005} rb={0.005} h={0.16} c={C.woodDark} seg={4} />
        <mesh position={[0.04, 0.13, 0]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.05, 0.14, 3]} />
          <M c={pal.accent} />
        </mesh>
      </group>
      {/* parasol */}
      <Cyl p={[-0.16, 0.12, -0.08]} rt={0.006} rb={0.006} h={0.24} c={C.woodDark} seg={4} />
      <mesh position={[-0.16, 0.24, -0.08]} castShadow>
        <coneGeometry args={[0.13, 0.07, 8]} />
        <M c={C.vermilion} />
      </mesh>
      <Box p={[-0.05, 0.03, -0.14]} s={[0.12, 0.02, 0.06]} c={pal.accent} />
    </>
  )
}

function Street({ pal }: { pal: Palette3D }) {
  return (
    <>
      {/* brick warehouse */}
      <Box p={[-0.1, 0.16, -0.04]} s={[0.3, 0.32, 0.3]} c={C.brick} />
      <Gable p={[-0.1, 0.32, -0.04]} w={0.34} d={0.36} h={0.12} c={C.tile} />
      <Box p={[-0.1, 0.12, 0.112]} s={[0.1, 0.16, 0.01]} c={C.woodDark} />
      {/* small wooden townhouse */}
      <Box p={[0.17, 0.12, 0.02]} s={[0.18, 0.24, 0.24]} c={pal.wall} />
      <Gable p={[0.17, 0.24, 0.02]} w={0.22} d={0.3} h={0.1} c={pal.roof} />
      {/* gas lamp */}
      <Cyl p={[0.2, 0.17, 0.24]} rt={0.008} rb={0.012} h={0.34} c={C.tile} seg={5} />
      <Box p={[0.2, 0.36, 0.24]} s={[0.05, 0.06, 0.05]} c={C.gold} glow={0.6} />
    </>
  )
}

function Market({ pal }: { pal: Palette3D }) {
  const colours = [pal.accent, C.gold, '#5f9e9a']
  return (
    <>
      {[-0.19, 0, 0.19].map((x, i) => (
        <group key={x} position={[x, 0, (i - 1) * 0.04]}>
          <Box p={[0, 0.07, 0]} s={[0.16, 0.14, 0.14]} c={C.wood} />
          <Cyl p={[-0.06, 0.16, -0.06]} rt={0.008} rb={0.008} h={0.32} c={C.woodDark} seg={4} />
          <Cyl p={[0.06, 0.16, -0.06]} rt={0.008} rb={0.008} h={0.32} c={C.woodDark} seg={4} />
          <Box p={[0, 0.3, 0.02]} s={[0.18, 0.02, 0.2]} r={[0.35, 0, 0]} c={colours[i]} />
          <Ball p={[-0.03, 0.16, 0.03]} rad={0.03} c={i === 1 ? '#e88a6a' : '#d8433a'} />
          <Ball p={[0.03, 0.16, 0.02]} rad={0.03} c={i === 2 ? '#7fa6c4' : '#e2b54a'} />
        </group>
      ))}
    </>
  )
}

function ShopPiece({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Box p={[0, 0.2, -0.03]} s={[0.44, 0.4, 0.34]} c={pal.wall} />
      <Box p={[0, 0.41, -0.03]} s={[0.48, 0.03, 0.38]} c={pal.roof} />
      <Box p={[0, 0.13, 0.142]} s={[0.34, 0.18, 0.01]} c={C.glass} glow={0.15} />
      <Box p={[0, 0.27, 0.17]} s={[0.4, 0.02, 0.1]} r={[0.4, 0, 0]} c={pal.accent} />
      <Box p={[0, 0.34, 0.142]} s={[0.26, 0.06, 0.01]} c={pal.accent} />
      {/* shopping bag */}
      <Box p={[0.24, 0.06, 0.22]} s={[0.08, 0.1, 0.05]} c={C.gold} />
    </>
  )
}

function Station({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Box p={[0, 0.04, -0.08]} s={[0.56, 0.08, 0.16]} c={C.stone} />
      {[-0.22, 0.22].map((x) => (
        <Cyl key={x} p={[x, 0.17, -0.12]} rt={0.01} rb={0.01} h={0.2} c={C.tile} seg={4} />
      ))}
      <Box p={[0, 0.28, -0.08]} s={[0.56, 0.025, 0.2]} c={pal.roof} />
      <Box p={[0, 0.01, 0.12]} s={[0.6, 0.02, 0.12]} c={C.stoneDark} />
      {/* train car */}
      <Box p={[0, 0.11, 0.12]} s={[0.46, 0.16, 0.13]} c={pal.wall} />
      <Box p={[0, 0.06, 0.12]} s={[0.462, 0.03, 0.132]} c={pal.accent} />
      {[-0.14, 0, 0.14].map((x) => (
        <Box key={x} p={[x, 0.14, 0.187]} s={[0.08, 0.05, 0.005]} c={C.glass} glow={0.2} />
      ))}
    </>
  )
}

function Landmark({ pal }: { pal: Palette3D }) {
  return (
    <>
      <Box p={[0, 0.03, 0]} s={[0.34, 0.06, 0.34]} c={C.stone} />
      <Box p={[0, 0.09, 0]} s={[0.24, 0.06, 0.24]} c={C.stoneDark} />
      <mesh position={[0, 0.34, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.07, 0.46, 4]} />
        <M c={C.stone} />
      </mesh>
      <Ball p={[0, 0.6, 0]} rad={0.05} c={pal.accent} />
    </>
  )
}

const PIECES: Record<SceneKind, (props: { pal: Palette3D }) => ReactNode> = {
  ramen: Ramen,
  seafood: Seafood,
  cafe: Cafe,
  restaurant: Restaurant,
  shrine: Shrine,
  temple: Temple,
  castle: Castle,
  onsen: Onsen,
  museum: Museum,
  park: Park,
  nature: Nature,
  viewpoint: Viewpoint,
  beach: Beach,
  street: Street,
  market: Market,
  shop: ShopPiece,
  station: Station,
  landmark: Landmark,
}

export function ScenePiece({
  kind,
  pal,
  opacity,
  reducedMotion,
}: {
  kind: SceneKind
  pal: Palette3D
  opacity: number
  reducedMotion: boolean
}) {
  const Piece = PIECES[kind] ?? Landmark
  return (
    <LookCtx.Provider value={{ opacity, reducedMotion }}>
      <Piece pal={pal} />
    </LookCtx.Provider>
  )
}
