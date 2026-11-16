// Light and sky for a moment of the trip: the sun rises and sets at the real
// times for that date and place, colours warm up at dawn and dusk, night is
// dark blue, and clouds, rain or snow dim and grey the day.
import * as THREE from 'three'
import type { Palette3D } from './palette3d'

export type Precip = 'none' | 'rain' | 'snow' | 'storm'

export interface Sky {
  /** CSS colours for the background behind the map. */
  top: string
  bottom: string
  sunColour: string
  sunIntensity: number
  /** Where the light comes from, as a unit vector (east = +x, up = +y, south = +z). */
  sunDir: [number, number, number]
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  ambient: number
  /** 0 by day, 1 at night: how much the lamps glow. */
  night: number
  precip: Precip
  /** 'day' | 'dawn' | 'dusk' | 'night', for the label. */
  phase: 'day' | 'dawn' | 'dusk' | 'night'
}

const RAD = Math.PI / 180

/** Sunrise and sunset in local hours (Japan time, UTC+9) for a date and place. */
export function sunTimes(date: string, lat: number, lng: number, utcOffset = 9): { rise: number; set: number } {
  const [y, m, d] = date.split('-').map(Number)
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000)
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (284 + n)) * RAD
  const b = ((2 * Math.PI) / 364) * (n - 81)
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b) // minutes
  const noon = 12 + utcOffset - lng / 15 - eot / 60
  const cosH = (Math.sin(-0.83 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl))
  const h = Math.acos(Math.min(1, Math.max(-1, cosH))) / RAD / 15
  return { rise: noon - h, set: noon + h }
}

export function precipOf(summary: string | undefined): Precip {
  if (!summary) return 'none'
  if (summary.includes('雷')) return 'storm'
  if (summary.includes('雪')) return 'snow'
  if (summary.includes('雨')) return 'rain'
  return 'none'
}

const cloudyOf = (summary: string | undefined) => !!summary && /陰|霧|雨|雪|雷/.test(summary)

const mix = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t))).getHexString()}`
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))

/** Plain daylight in the trip's colours: the overview, with no particular moment. */
export function daylight(pal: Palette3D): Sky {
  return {
    top: pal.skyTop,
    bottom: pal.skyBottom,
    sunColour: '#ffffff',
    sunIntensity: 1.6,
    sunDir: [0.35, 0.8, 0.48],
    hemiSky: pal.skyTop,
    hemiGround: pal.rockDark,
    hemiIntensity: 1.5,
    ambient: 0.3,
    night: 0,
    precip: 'none',
    phase: 'day',
  }
}

/**
 * The sky at `hour` (local, e.g. 18.5) on `date` at a place, under the day's
 * weather summary ("雪", "晴時多雲"…).
 */
export function skyAt(pal: Palette3D, date: string, lat: number, lng: number, hour: number, summary?: string): Sky {
  const { rise, set } = sunTimes(date, lat, lng)
  const span = set - rise
  // Sun height: 0 at sunrise and sunset, 1 at noon, negative at night.
  const t = (hour - rise) / span
  // Below the horizon, how far into the night: an hour and a bit after sunset it is fully dark.
  const intoNight = hour < rise ? rise - hour : hour - set
  const elevation = t >= 0 && t <= 1 ? Math.sin(Math.PI * t) : -Math.min(1, intoNight / 1.2)
  // Twilight lasts a while after sunset (and before sunrise): fully dark only about an hour later.
  const day = Math.min(1, Math.max(0, (elevation + 0.38) / 0.62)) // 0 night … 1 full day
  const golden = Math.max(0, 1 - Math.abs(elevation) / 0.4) // near the horizon, either side
  const night = 1 - day
  const phase: Sky['phase'] = day < 0.12 ? 'night' : golden > 0.3 ? (hour < 12 ? 'dawn' : 'dusk') : 'day'

  // Sun path: rises in the east (+x), swings south (+z, towards the camera), sets in the west.
  const az = Math.PI * Math.min(1, Math.max(0, t))
  const height = Math.max(0.12, elevation) * 0.9
  const sunDir = new THREE.Vector3(Math.cos(az), height, 0.35 + Math.sin(az) * 0.45).normalize()
  // At night the light is the moon, high in the south.
  const moonDir = new THREE.Vector3(-0.25, 0.85, 0.4).normalize()
  const dir = sunDir.lerp(moonDir, night)

  let top = mix(mix(pal.skyTop, '#f2a07a', golden * 0.75), '#0f1a33', night)
  let bottom = mix(mix(pal.skyBottom, '#f7d3b0', golden * 0.8), '#243458', night)
  let sunColour = mix(mix('#ffffff', '#ffb070', golden), '#9fb3ff', night)
  let sunIntensity = lerp(0.35, lerp(1.7, 1.1, golden), day)
  let hemiSky = mix(mix(pal.skyTop, '#f3c9a8', golden * 0.6), '#3b4a7a', night)
  let hemiIntensity = lerp(0.45, 1.5, day)

  const precip = precipOf(summary)
  if (cloudyOf(summary)) {
    // Clouds: a flatter, greyer light, darker for rain and storms.
    const grey = precip === 'snow' ? '#dfe4ea' : precip === 'none' ? '#c9ced6' : '#9aa3ad'
    const amount = precip === 'none' ? 0.55 : 0.75
    top = mix(top, mix(grey, '#1a2236', night), amount)
    bottom = mix(bottom, mix(grey, '#2a3448', night), amount)
    sunColour = mix(sunColour, '#e8ecf2', amount)
    sunIntensity *= 1 - amount * 0.55
    hemiSky = mix(hemiSky, grey, amount * day)
    hemiIntensity *= 1 - amount * 0.1
  }

  return {
    top,
    bottom,
    sunColour,
    sunIntensity,
    sunDir: [dir.x, dir.y, dir.z],
    hemiSky,
    hemiGround: mix(pal.rockDark, '#0d1220', night),
    hemiIntensity,
    ambient: lerp(0.18, 0.3, day),
    night,
    precip,
    phase,
  }
}

/** "18:30" → 18.5 */
export function hourOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h + (m || 0) / 60
}
