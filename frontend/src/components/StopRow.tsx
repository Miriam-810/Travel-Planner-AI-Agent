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
        className={`grid cursor-pointer grid-cols-[62px_1fr] items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
          selected ? 'border-coral bg-coral-soft' : 'border-line bg-white hover:border-coral'
        }`}
      >
        <div className="flex flex-col items-start gap-1 pt-0.5">
          <span className="font-mono text-[11px] leading-tight text-ink-soft tabular-nums">{hhmm(stop.arrive)}</span>
          <span
            className={`grid size-[22px] place-items-center rounded-full font-mono text-[11.5px] font-bold text-white ${
              selected ? 'bg-ink' : 'bg-coral'
            }`}
            aria-label={`第 ${index} 站`}
          >
            {index}
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-[14px] leading-snug font-bold">
            <KindBadge stop={stop} />
            {stop.name}
          </div>
          {stop.note && <p className="m-0 mt-0.5 text-[12.5px] text-ink-soft">{stop.note}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <HoursChip hours={stop.hours} />
            <span className="font-mono text-[11px] text-ink-soft">停留 {stop.stay_min} 分</span>
            {stop.maps_url && (
              <a
                href={stop.maps_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[12px] font-bold text-coral-deep underline decoration-coral/40 underline-offset-2 hover:decoration-coral"
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
