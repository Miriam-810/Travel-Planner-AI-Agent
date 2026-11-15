import { formatTemp } from '../lib/format'
import type { PlaceHours, Stop, Weather } from '../types'

const KIND_STYLE = {
  sight: { label: '景點', cls: 'bg-[#dcebf0] text-[#2f6274]' },
  lunch: { label: '午餐', cls: 'bg-[#f6ecd0] text-[#7d5d16]' },
  dinner: { label: '晚餐', cls: 'bg-apricot-soft text-apricot-deep' },
  shop: { label: '購物', cls: 'bg-[#ece4f1] text-[#634577]' },
} as const

export function KindBadge({ stop }: { stop: Pick<Stop, 'kind' | 'meal'> }) {
  const key = stop.kind === 'meal' ? (stop.meal ?? 'lunch') : stop.kind
  const { label, cls } = KIND_STYLE[key]
  return (
    <span className={`mr-1.5 inline-block rounded-full px-2 align-[2px] text-[11px] leading-[19px] ${cls}`}>{label}</span>
  )
}

export function HoursChip({ hours }: { hours: PlaceHours | null }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px]'
  if (!hours || hours.open_at_arrive === null) {
    return <span className={`${base} bg-field text-ink-soft`}>無營業時間資料</span>
  }
  if (hours.open_at_arrive) {
    return (
      <span className={`${base} bg-ok-soft text-ok`}>
        <span aria-hidden>✓</span>
        <span className="tabular-nums">{hours.today_text}</span>
      </span>
    )
  }
  return (
    <span className={`${base} bg-apricot-soft text-apricot-deep`}>
      <span aria-hidden>!</span> 營業時間外
      {hours.today_text && <span className="tabular-nums">{hours.today_text}</span>}
    </span>
  )
}

export function WeatherBadge({ weather }: { weather: Weather | null }) {
  if (!weather) {
    return <span className="text-[12px] text-ink-soft">天氣無資料</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-ink-soft">
      <span className="text-ink">{weather.summary}</span>
      <span className="tabular-nums">
        {formatTemp(weather.high_c)} / {formatTemp(weather.low_c)}
      </span>
      <span
        className={`rounded-full px-1.5 text-[10.5px] ${
          weather.source === 'forecast' ? 'bg-ok-soft text-ok' : 'bg-field text-ink-soft'
        }`}
        title={weather.source === 'forecast' ? 'Open-Meteo 天氣預報' : '過去幾年同期的平均值'}
      >
        {weather.source === 'forecast' ? '預報' : '往年平均'}
      </span>
    </span>
  )
}
