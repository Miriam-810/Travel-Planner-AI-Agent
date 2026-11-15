// Number badges drawn on a canvas and used as sprite textures, so the 3D
// scene needs no font loading or HTML overlays.
import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()

export function badgeTexture(text: string, fill: string, color = '#ffffff'): THREE.CanvasTexture {
  const key = `${text}|${fill}|${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = `700 ${text.length > 1 ? 56 : 64}px Quicksand, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, size / 2 + 4)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  cache.set(key, tex)
  return tex
}
