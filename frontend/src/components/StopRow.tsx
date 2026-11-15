import { hhmm } from '../lib/format'
import type { Stop } from '../types'
import { HoursChip, KindBadge } from './Badges'

interface Props {
  stop: Stop
  index: number
  selected: boolean
  onSelect: (id: string) => void
}

export function StopRow({ stop, index, selected, onSelect }: Props) {
  return (
    <li>
      <div
        id={`stop-${stop.id}`}
        // Land below the sticky map when scrolled into view from a pin click.
        style={{ scrollMarginTop: 'calc(clamp(240px, 40vh, 420px) + 32px)' }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => onSelect(stop.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(stop.id)
          }
        }}
        className={`grid cursor-pointer grid-cols-[56px_1fr] items-start gap-2.5 rounded-3xl border-2 px-3 py-3 transition-colors ${
          selected ? 'border-sage bg-sage-soft' : 'border-transparent bg-cream hover:border-sage/50'
        }`}
      >
        <div className="flex flex-col items-start gap-1 pt-0.5">
          <span className="text-[13px] leading-tight font-bold text-ink tabular-nums">{hhmm(stop.arrive)}</span>
          <span
            className={`grid size-6 place-items-center rounded-full text-[12px] font-bold text-white ${
              selected ? 'bg-ink' : 'bg-sage'
            }`}
            aria-label={`第 ${index} 站`}
          >
            {index}
          </span>
        </div>
        <div className="min-w-0">
          <div className="font-[family-name:var(--font-round)] text-[15px] leading-snug">
            <KindBadge stop={stop} />
            {stop.name}
          </div>
          {stop.note && <p className="m-0 mt-0.5 text-[12.5px] text-ink-soft">{stop.note}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <HoursChip hours={stop.hours} />
            <span className="text-[12px] text-ink-soft">停留 {stop.stay_min} 分</span>
            {stop.maps_url && (
              <a
                href={stop.maps_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[12.5px] text-sage-deep underline decoration-sage/40 underline-offset-2 hover:decoration-sage"
              >
                Google 地圖 ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
