import { monthDayDot } from '../lib/format'
import { hasMapsConfig } from '../lib/mapsConfig'
import type { Trip } from '../types'
import { TripMap } from './TripMap'

interface Props {
  trip: Trip
  openDay: number | null
  selectedStopId: string | null
  onPickStop: (dayIndex: number, stopId: string) => void
  onOverview: () => void
}

/** Rectangular map block at the top of the trip page, with the brand chip and overview button. */
export function MapPanel({ trip, openDay, selectedStopId, onPickStop, onOverview }: Props) {
  return (
    <div data-map-frame className="relative h-[clamp(240px,40vh,420px)] overflow-hidden rounded-3xl bg-[radial-gradient(120%_90%_at_50%_45%,#9CC4C5_0%,var(--color-sea)_55%,var(--color-sea-deep)_100%)] shadow-[0_2px_0_rgba(30,26,23,.05),0_24px_50px_-28px_rgba(30,26,23,.55)]">
      {hasMapsConfig ? (
        <TripMap trip={trip} openDay={openDay} selectedStopId={selectedStopId} onPickStop={onPickStop} />
      ) : (
        <div className="absolute inset-x-0 bottom-4 px-4 text-center font-mono text-[11px] tracking-[.12em] text-white/90">
          尚未設定 Google 地圖：請見 docs/GOOGLE_MAPS_SETUP.md
        </div>
      )}

      <div data-brand-chip className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-3 rounded-2xl bg-paper-2/95 py-2.5 pr-4 pl-3.5 shadow-[0_1px_0_rgba(30,26,23,.06),0_12px_30px_-18px_rgba(30,26,23,.5)] sm:top-5 sm:left-5 sm:gap-4 sm:py-3.5 sm:pr-5 sm:pl-4">
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
        aria-pressed={openDay === null}
        className={`absolute top-3 right-3 z-10 rounded-xl border px-3 py-2 text-[13px] font-bold shadow-[0_6px_14px_-10px_rgba(30,26,23,.5)] sm:top-5 sm:right-5 ${
          openDay === null ? 'border-ink bg-ink text-paper' : 'border-ink/10 bg-paper/95'
        }`}
      >
        全景
      </button>
    </div>
  )
}
