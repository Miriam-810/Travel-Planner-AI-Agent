// One floating islet for one day of the trip: grass top, rock underside, a few
// trees in the trip's palette, stepping stones linking the day's stops, and
// numbered pins when the day is open.
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Day } from '../types'
import { rockGeometry, outline, topGeometry } from './geometry'
import { ISLET_RADIUS, stopSpots } from './layout'
import { badgeTexture } from './labels'
import type { Palette3D } from './palette3d'
import { seeded } from './random'

const TOP = 0.35

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
    const spots = stopSpots(day.stops.length)
    // Trees go where there is no stop, near the rim.
    const trees: { x: number; z: number; s: number; c: string }[] = []
    for (let tries = 0; trees.length < 7 && tries < 60; tries++) {
      const a = rand() * Math.PI * 2
      const r = ISLET_RADIUS * (0.35 + rand() * 0.5)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const clear = spots.every(([sx, sz]) => Math.hypot(sx - x, sz - z) > 0.55) && trees.every((t) => Math.hypot(t.x - x, t.z - z) > 0.4)
      if (clear) trees.push({ x, z, s: 0.75 + rand() * 0.5, c: pal.leaves[Math.floor(rand() * pal.leaves.length)] })
    }
    const stones: [number, number][] = []
    for (let i = 0; i < spots.length - 1; i++) {
      const [ax, az] = spots[i]
      const [bx, bz] = spots[i + 1]
      for (let t = 0.25; t < 0.8; t += 0.25) stones.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
    return {
      top: topGeometry(radii, TOP),
      rock: rockGeometry(radii, rand, 1.6 + rand() * 0.6),
      spots,
      trees,
      stones,
      phase: rand() * Math.PI * 2,
      pond: rand() > 0.45 ? { x: (rand() - 0.5) * 0.8, z: ISLET_RADIUS * 0.15 + rand() * 0.3 } : null,
    }
  }, [day.date, day.stops.length, pal])

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
          <mesh position={[shape.pond.x, TOP + 0.01, shape.pond.z]} rotation={[-Math.PI / 2, 0, 0]}>
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

        {day.lodging && <House x={-ISLET_RADIUS * 0.15} z={ISLET_RADIUS * 0.6} pal={pal} opacity={opacity} />}
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
          return (
            <group
              key={stop.id}
              position={[x, TOP, z]}
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
              <mesh position={[0, 0.03, 0]}>
                <cylinderGeometry args={[0.16, 0.18, 0.06, 8]} />
                <meshStandardMaterial color={selected ? pal.ink : pal.accent} flatShading />
              </mesh>
              <mesh position={[0, 0.4, 0]}>
                <cylinderGeometry args={[0.02, 0.02, 0.7, 5]} />
                <meshStandardMaterial color={pal.ink} />
              </mesh>
              <sprite position={[0, selected ? 0.98 : 0.88, 0]} scale={selected ? [0.62, 0.62, 0.62] : [0.48, 0.48, 0.48]}>
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
