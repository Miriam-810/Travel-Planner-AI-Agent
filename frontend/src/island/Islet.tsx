// One floating islet for one day of the trip: grass top, rock underside, a
// little scene for every stop (ramen shop, shrine, castle…), stepping stones
// between them, trees in the trip's palette, and numbered badges when open.
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Day } from '../types'
import { rockGeometry, outline, topGeometry } from './geometry'
import { freeSpot, ISLET_RADIUS, sceneScale, stopSpots } from './layout'
import { badgeTexture } from './labels'
import type { Palette3D } from './palette3d'
import { seeded } from './random'
import { PIECE_HEIGHT, sceneOf } from './sceneKinds'
import { ScenePiece } from './scenes'

const TOP = 0.35
/** Scene pieces are modelled at ~0.6 wide; drawn a bit larger so they read from afar. */
const PIECE_SCALE = 1.3

interface Props {
  day: Day
  index: number
  position: [number, number, number]
  pal: Palette3D
  open: boolean
  faded: boolean
  selectedStopId: string | null
  reducedMotion: boolean
  onPickDay: (index: number) => void
  onPickStop: (index: number, stopId: string) => void
}

function pointer(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : ''
}

export function Islet({ day, index, position, pal, open, faded, selectedStopId, reducedMotion, onPickDay, onPickStop }: Props) {
  const group = useRef<THREE.Group>(null)

  const shape = useMemo(() => {
    const rand = seeded(day.date)
    const radii = outline(rand, ISLET_RADIUS)
    const spots = stopSpots(day)
    const hasHouse = Boolean(day.lodging)
    // The lodging house (or a pond) takes the most open patch of grass.
    const [hx, hz] = freeSpot(spots)
    // Trees go where there is no scene and no house.
    const trees: { x: number; z: number; s: number; c: string }[] = []
    for (let tries = 0; trees.length < 7 && tries < 60; tries++) {
      const a = rand() * Math.PI * 2
      const r = ISLET_RADIUS * (0.2 + rand() * 0.68)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const clear =
        spots.every(([sx, sz]) => Math.hypot(sx - x, sz - z) > 0.55 && !(z > sz && z - sz < 1 && Math.abs(x - sx) < 0.45)) &&
        !(hasHouse && z > hz && z - hz < 1 && Math.abs(x - hx) < 0.45) &&
        Math.hypot(x - hx, z - hz) > (hasHouse ? 0.5 : 0.62) &&
        trees.every((t) => Math.hypot(t.x - x, t.z - z) > 0.4)
      // (the extra spot test keeps trees from standing right in front of a scene)
      if (clear) trees.push({ x, z, s: 0.75 + rand() * 0.5, c: pal.leaves[Math.floor(rand() * pal.leaves.length)] })
    }
    const stones: [number, number][] = []
    for (let i = 0; i < spots.length - 1; i++) {
      const [ax, az] = spots[i]
      const [bx, bz] = spots[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      for (let t = 0.1; t < 0.95; t += 0.14) {
        const along = t * len
        if (along > 0.42 && len - along > 0.42) stones.push([ax + (bx - ax) * t, az + (bz - az) * t])
      }
    }
    return {
      top: topGeometry(radii, TOP),
      rock: rockGeometry(radii, rand, 1.6 + rand() * 0.6),
      spots,
      trees,
      stones,
      phase: rand() * Math.PI * 2,
      home: [hx, hz] as const,
      pond: !hasHouse && rand() > 0.3,
      pieceScale: PIECE_SCALE * sceneScale(day.stops.length),
    }
  }, [day, pal])

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    group.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.8 + shape.phase) * 0.08
  })

  const pickDay = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onPickDay(index)
  }

  const opacity = faded ? 0.35 : 1

  return (
    <group ref={group} position={position}>
      <group
        onClick={pickDay}
        onPointerOver={(e) => {
          e.stopPropagation()
          pointer(true)
        }}
        onPointerOut={() => pointer(false)}
      >
        <mesh geometry={shape.top} castShadow receiveShadow>
          <meshStandardMaterial color={pal.grass} flatShading transparent opacity={opacity} />
        </mesh>
        <mesh geometry={shape.rock} castShadow>
          <meshStandardMaterial color={pal.rock} flatShading transparent opacity={opacity} />
        </mesh>

        {shape.pond && (
          <mesh position={[shape.home[0], TOP + 0.01, shape.home[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.38, 7]} />
            <meshStandardMaterial color={pal.water} transparent opacity={0.9 * opacity} />
          </mesh>
        )}

        {shape.trees.map((t, i) => (
          <Foliage key={i} kind={pal.foliage} x={t.x} z={t.z} scale={t.s} color={t.c} trunk={pal.trunk} opacity={opacity} />
        ))}

        {shape.stones.map(([x, z], i) => (
          <mesh key={i} position={[x, TOP + 0.02, z]} receiveShadow>
            <cylinderGeometry args={[0.09, 0.1, 0.04, 6]} />
            <meshStandardMaterial color={pal.path} flatShading transparent opacity={opacity} />
          </mesh>
        ))}

        {day.lodging && <House x={shape.home[0]} z={shape.home[1]} pal={pal} opacity={opacity} />}

        {day.stops.map((stop, i) => {
          const [x, z] = shape.spots[i]
          const selected = open && stop.id === selectedStopId
          return (
            <group
              key={stop.id}
              position={[x, TOP, z]}
              scale={shape.pieceScale * (selected ? 1.15 : 1)}
              onClick={(e) => {
                if (!open) return // let the click open the day
                e.stopPropagation()
                onPickStop(index, stop.id)
              }}
            >
              <ScenePiece kind={sceneOf(stop)} pal={pal} opacity={opacity} reducedMotion={reducedMotion} />
            </group>
          )
        })}
      </group>

      {!open && (
        <sprite position={[0, 2.1, 0]} scale={[0.85, 0.85, 0.85]} onClick={pickDay}>
          <spriteMaterial map={badgeTexture(String(index + 1), pal.accent)} transparent opacity={opacity} depthTest={false} />
        </sprite>
      )}

      {open &&
        day.stops.map((stop, i) => {
          const [x, z] = shape.spots[i]
          const selected = stop.id === selectedStopId
          // The badge floats over the scene on a thin stick.
          const top = TOP + PIECE_HEIGHT[sceneOf(stop)] * shape.pieceScale * (selected ? 1.15 : 1)
          const stick = 0.1
          const y = top + stick + 0.16
          return (
            <group key={stop.id}>
              <mesh position={[x, top + stick / 2, z]}>
                <cylinderGeometry args={[0.012, 0.012, stick, 4]} />
                <meshStandardMaterial color={selected ? pal.ink : pal.accent} />
              </mesh>
              <sprite
                position={[x, y, z]}
                scale={selected ? [0.48, 0.48, 0.48] : [0.36, 0.36, 0.36]}
                renderOrder={10}
                onClick={(e) => {
                  e.stopPropagation()
                  onPickStop(index, stop.id)
                }}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  pointer(true)
                }}
                onPointerOut={() => pointer(false)}
              >
                <spriteMaterial map={badgeTexture(String(i + 1), selected ? pal.ink : pal.accent)} depthTest={false} />
              </sprite>
            </group>
          )
        })}
    </group>
  )
}

function Foliage({
  kind,
  x,
  z,
  scale,
  color,
  trunk,
  opacity,
}: {
  kind: Palette3D['foliage']
  x: number
  z: number
  scale: number
  color: string
  trunk: string
  opacity: number
}) {
  const y = TOP
  const mat = <meshStandardMaterial color={color} flatShading transparent opacity={opacity} />
  if (kind === 'block') {
    const h = 0.35 + scale * 0.45
    return (
      <mesh position={[x, y + h / 2, z]} castShadow>
        <boxGeometry args={[0.32, h, 0.32]} />
        {mat}
      </mesh>
    )
  }
  return (
    <group position={[x, y, z]} scale={scale}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, kind === 'palm' ? 0.6 : 0.32, 5]} />
        <meshStandardMaterial color={trunk} flatShading transparent opacity={opacity} />
      </mesh>
      {kind === 'pine' && (
        <>
          <mesh position={[0, 0.45, 0]} castShadow>
            <coneGeometry args={[0.26, 0.45, 6]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.7, 0]} castShadow>
            <coneGeometry args={[0.18, 0.35, 6]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.84, 0]}>
            <coneGeometry args={[0.09, 0.14, 6]} />
            <meshStandardMaterial color="#ffffff" flatShading transparent opacity={opacity} />
          </mesh>
        </>
      )}
      {kind === 'round' && (
        <mesh position={[0, 0.48, 0]} castShadow>
          <icosahedronGeometry args={[0.24, 0]} />
          {mat}
        </mesh>
      )}
      {kind === 'palm' && (
        <mesh position={[0, 0.66, 0]} castShadow>
          <coneGeometry args={[0.32, 0.14, 6]} />
          {mat}
        </mesh>
      )}
    </group>
  )
}

function House({ x, z, pal, opacity }: { x: number; z: number; pal: Palette3D; opacity: number }) {
  return (
    <group position={[x, TOP, z]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.42, 0.32, 0.34]} />
        <meshStandardMaterial color={pal.wall} flatShading transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.36, 0.24, 4]} />
        <meshStandardMaterial color={pal.roof} flatShading transparent opacity={opacity} />
      </mesh>
      <mesh position={[0.07, 0.13, 0.172]}>
        <planeGeometry args={[0.09, 0.14]} />
        <meshStandardMaterial color="#f2c46d" emissive="#f2c46d" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}
