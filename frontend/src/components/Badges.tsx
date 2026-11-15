import { formatTemp } from '../lib/format'
import type { PlaceHours, Stop, Weather } from '../types'

const KIND_STYLE = {
  sight: { label: '景點', cls: 'bg-[#DCEAF4] text-[#2B5C7E]' },
  lunch: { label: '午餐', cls: 'bg-[#FCEFD3] text-[#8A5A0B]' },
  dinner: { label: '晚餐', cls: 'bg-coral-soft text-coral-deep' },
  shop: { label: '購物', cls: 'bg-[#EEE3F1] text-[#6A3F78]' },
} as const

export function KindBadge({ stop }: { stop: Pick<Stop, 'kind' | 'meal'> }) {
  const key = stop.kind === 'meal' ? (stop.meal ?? 'lunch') : stop.kind
  const { label, cls } = KIND_STYLE[key]
  return (
    <span className={`mr-1.5 inline-block rounded-md px-1.5 align-[2px] text-[10.5px] leading-[18px] font-bold ${cls}`}>
      {label}
    </span>
  )
}

export function HoursChip({ hours }: { hours: PlaceHours | null }) {
  const base = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-px text-[12px]'
  if (!hours || hours.open_at_arrive === null) {
    return <span className={`${base} border-line bg-white text-ink-soft`}>無營業時間資料</span>
  }
  if (hours.open_at_arrive) {
    return (
      <span className={`${base} border-ok-line bg-ok-soft font-bold text-ok`}>
        <span aria-hidden>✓</span>
        <span className="font-mono text-[11px] font-medium">{hours.today_text}</span>
      </span>
    )
  }
  return (
    <span className={`${base} border-[#F4CDBB] bg-coral-soft font-bold text-coral-deep`}>
      <span aria-hidden>⚠</span> 營業時間外
      {hours.today_text && <span className="font-mono text-[11px] font-medium">{hours.today_text}</span>}
    </span>
  )
}

export function WeatherBadge({ weather }: { weather: Weather | null }) {
  if (!weather) {
    return <span className="font-mono text-[11px] text-ink-soft">天氣無資料</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink-soft">
      <span className="font-bold text-ink">{weather.summary}</span>
      <span className="font-mono text-[11px] tabular-nums">
        {formatTemp(weather.high_c)} / {formatTemp(weather.low_c)}
      </span>
      <span
        className={`rounded px-1 text-[10px] font-bold ${
          weather.source === 'forecast' ? 'bg-ok-soft text-ok' : 'bg-paper-2 text-ink-soft'
        }`}
        title={weather.source === 'forecast' ? 'Open-Meteo 天氣預報' : '過去幾年同期的平均值'}
      >
        {weather.source === 'forecast' ? '預報' : '歷史平均'}
      </span>
    </span>
  )
}
