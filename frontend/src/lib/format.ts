const ZH_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const ZH_DOW = ['日', '一', '二', '三', '四', '五', '六']
const EN_DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Parse "YYYY-MM-DD" as a local calendar date (no timezone shift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "12/25" */
export function monthDay(iso: string): string {
  const d = parseDate(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/** "12.25" for the brand chip */
export function monthDayDot(iso: string): string {
  return monthDay(iso).replace('/', '.')
}

export function weekdayZh(iso: string): string {
  return ZH_DOW[parseDate(iso).getDay()]
}

export function weekdayEn(iso: string): string {
  return EN_DOW[parseDate(iso).getDay()]
}

/** 1 → "一", 10 → "十", 12 → "十二" */
export function zhNumber(n: number): string {
  if (n <= 10) return ZH_NUM[n]
  if (n < 20) return `十${ZH_NUM[n - 10]}`
  return String(n)
}

/** "12:30:00" → "12:30" */
export function hhmm(time: string): string {
  return time.slice(0, 5)
}

export function formatTemp(c: number): string {
  return `${Math.round(c)}°`
}
