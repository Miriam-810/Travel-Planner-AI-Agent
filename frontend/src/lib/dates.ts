// Calendar dates as "YYYY-MM-DD" strings, in the device's local time.
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const pad = (n: number) => String(n).padStart(2, '0')
export const isoOf = (y: number, m: number, d: number) => {
  const dt = new Date(y, m, d)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoOf(y, m - 1, d + n)
}
export function todayIso(): string {
  const t = new Date()
  return isoOf(t.getFullYear(), t.getMonth(), t.getDate())
}
/** "2026/12/25（五）" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}/${pad(m)}/${pad(d)}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`
}
