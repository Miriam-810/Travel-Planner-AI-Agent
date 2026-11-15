import { monthDay, weekdayZh, zhNumber } from '../lib/format'
import type { Day } from '../types'
import { WeatherBadge } from './Badges'
import { StopRow } from './StopRow'

interface Props {
  day: Day
  index: number
  open: boolean
  selectedStopId: string | null
  onToggle: () => void
  onSelectStop: (id: string) => void
}

export function DayItem({ day, index, open, selectedStopId, onToggle, onSelectStop }: Props) {
  const n = index + 1
  const panelId = `day-panel-${n}`

  return (
    <li
      className={`transition-colors ${open ? 'my-1 rounded-2xl bg-coral-soft/60' : 'border-b border-line last:border-b-0'}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`grid w-full grid-cols-[44px_1fr_auto] items-center gap-2 rounded-2xl border-0 bg-transparent px-3 py-3.5 text-left ${
          open ? '' : 'hover:bg-paper-2'
        }`}
      >
        <span className="font-display text-[26px] leading-none font-bold text-coral italic">{n}</span>
        <span className="min-w-0">
          <span className="block font-mono text-[10.5px] font-bold tracking-[.14em] text-coral">第{zhNumber(n)}天</span>
          <span className="block text-[15.5px] leading-snug font-bold">{day.title}</span>
          <span className="mt-0.5 block sm:hidden">
            <WeatherBadge weather={day.weather} />
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden sm:inline-flex">
            <WeatherBadge weather={day.weather} />
          </span>
          <span className="text-right font-mono text-[11px] leading-tight text-ink-soft">
            <b className="block text-[12px] text-ink">{monthDay(day.date)}</b>
            {weekdayZh(day.date)}
          </span>
          <span
            aria-hidden
            className={`text-[14px] text-ink-soft transition-transform duration-300 ${open ? 'rotate-90' : ''}`}
          >
            ›
          </span>
        </span>
      </button>

      {open && (
        <div id={panelId} className="px-3 pb-4">
          {day.warnings.length > 0 && (
            <div className="mb-3 rounded-r-xl border-l-[3px] border-coral bg-paper-2 px-3 py-2 text-[13.5px] text-[#4B433C]">
              {day.warnings.map((w) => (
                <p key={w} className="m-0">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}

          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {day.stops.map((stop, i) => (
              <StopRow
                key={stop.id}
                stop={stop}
                index={i + 1}
                selected={stop.id === selectedStopId}
                onSelect={onSelectStop}
              />
            ))}
          </ol>

          {day.lodging && (
            <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-3 rounded-xl border border-line bg-white px-3 py-2.5 text-[13.5px]">
              <dt className="text-ink-soft">住宿</dt>
              <dd className="m-0 font-bold">{day.lodging}</dd>
            </dl>
          )}
        </div>
      )}
    </li>
  )
}
