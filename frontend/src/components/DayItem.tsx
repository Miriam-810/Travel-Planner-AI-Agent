import { monthDay, weekdayZh, zhNumber } from '../lib/format'
import type { Day } from '../types'
import { WeatherBadge } from './Badges'
import { Icon } from './Icon'
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
    <li className={`rounded-[26px] transition-colors ${open ? 'bg-sage-soft' : 'bg-cream shadow-[var(--shadow-soft)]'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-[26px] border-0 bg-transparent px-4 py-3.5 text-left"
      >
        <span
          className={`grid size-11 place-items-center rounded-2xl text-[18px] font-bold tabular-nums ${
            open ? 'bg-sage text-white' : 'bg-sage-soft text-sage-deep'
          }`}
        >
          {n}
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] text-ink-soft">第{zhNumber(n)}天</span>
          <span className="block font-[family-name:var(--font-round)] text-[16.5px] leading-snug">{day.title}</span>
          <span className="mt-0.5 block sm:hidden">
            <WeatherBadge weather={day.weather} />
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden sm:inline-flex">
            <WeatherBadge weather={day.weather} />
          </span>
          <span className="text-right text-[12px] leading-tight text-ink-soft tabular-nums">
            <b className="block text-[13px] text-ink">{monthDay(day.date)}</b>
            週{weekdayZh(day.date)}
          </span>
          <span aria-hidden className={`text-ink-soft transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
            <Icon name="down" size={18} />
          </span>
        </span>
      </button>

      {open && (
        <div id={panelId} className="px-3 pb-4">
          {day.warnings.length > 0 && (
            <div className="mb-3 rounded-3xl bg-apricot-soft px-4 py-2.5 text-[13.5px] text-apricot-deep">
              {day.warnings.map((w) => (
                <p key={w} className="m-0">
                  ! {w}
                </p>
              ))}
            </div>
          )}

          <ol className="m-0 flex list-none flex-col gap-2 p-0">
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
            <div className="mt-3 flex items-center gap-2 rounded-3xl bg-cream px-4 py-2.5 text-[14px]">
              <span className="text-ink-soft">
                <Icon name="bed" size={18} />
              </span>
              <span className="text-ink-soft">今晚住</span>
              <span>{day.lodging}</span>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
