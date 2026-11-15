import { monthDayDot } from '../lib/format'
import type { Trip } from '../types'

interface Props {
  trip: Trip
  onOverview: () => void
}

/**
 * Map block at the top of the trip page.
 * Step 3: styled placeholder. Step 4 swaps the inner area for a Google Map
 * linked to the open day and the selected stop.
 */
export function MapPanel({ trip, onOverview }: Props) {
  return (
    <div className="relative h-[clamp(240px,40vh,420px)] overflow-hidden rounded-3xl bg-[radial-gradient(120%_90%_at_50%_45%,#9CC4C5_0%,var(--color-sea)_55%,var(--color-sea-deep)_100%)] shadow-[0_2px_0_rgba(30,26,23,.05),0_24px_50px_-28px_rgba(30,26,23,.55)]">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-3 rounded-2xl bg-paper-2/95 py-2.5 pr-4 pl-3.5 shadow-[0_1px_0_rgba(30,26,23,.06),0_12px_30px_-18px_rgba(30,26,23,.5)] sm:top-5 sm:left-5 sm:gap-4 sm:py-3.5 sm:pr-5 sm:pl-4">
        <div className="font-display text-[22px] leading-[.86] font-black tracking-[-.02em] text-coral sm:text-[30px]">
          {trip.days.length}
          <br />
          DAYS
        </div>
        <div>
          <div className="text-[15px] font-black tracking-[.12em] sm:text-[19px]">{trip.destination}</div>
          <div className="flex items-center gap-2 text-[12px] text-ink-soft">
            <b className="font-mono font-bold text-coral">
              {monthDayDot(trip.start_date)}—{monthDayDot(trip.end_date)}
            </b>
            {trip.travelers} 人
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOverview}
        className="absolute top-3 right-3 z-10 rounded-xl border border-ink/10 bg-paper/95 px-3 py-2 text-[13px] font-bold shadow-[0_6px_14px_-10px_rgba(30,26,23,.5)] sm:top-5 sm:right-5"
      >
        全景
      </button>

      <div className="absolute inset-x-0 bottom-4 text-center font-mono text-[11px] tracking-[.2em] text-white/85 uppercase">
        Google 地圖將在步驟 4 加入
      </div>
    </div>
  )
}
