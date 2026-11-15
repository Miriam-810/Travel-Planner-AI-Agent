export const ISLET_RADIUS = 2

/** Where each stop sits on the islet: around an inner ring, in visiting order. */
export function stopSpots(count: number): [number, number][] {
  const r = ISLET_RADIUS * 0.55
  const start = -Math.PI * 0.85
  const span = Math.PI * 1.7
  return Array.from({ length: count }, (_, i) => {
    const a = count === 1 ? -Math.PI / 2 : start + (span * i) / (count - 1)
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}
