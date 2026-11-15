import { lazy, Suspense, useState } from 'react'
import { monthDayDot } from '../lib/format'
import { hasMapsConfig } from '../lib/mapsConfig'
import { load, save } from '../lib/storage'
import type { Trip } from '../types'
import { TripMap } from './TripMap'

// Three.js is large; load it only when a trip page is shown.
const IslandScene = lazy(() => import('../island/IslandScene'))

type View = 'island' | 'map'
const VIEW_KEY = 'tp.mapView'

interface Props {
  trip: Trip
  openDay: number | null
  selectedStopId: string | null
  onPickDay: (dayIndex: number) => void
  onPickStop: (dayIndex: number, stopId: string) => void
  onOverview: () => void
}

/** The block at the top of the trip page: the trip island, or the Google map as a second tab. */
export function MapPanel({ trip, openDay, selectedStopId, onPickDay, onPickStop, onOverview }: Props) {
  const [view, setView] = useState<View>(() => (load<View>(VIEW_KEY) === 'map' ? 'map' : 'island'))
  const choose = (v: View) => {
    setView(v)
    save(VIEW_KEY, v)
  }

  return (
    <div data-map-frame className={`relative ${openDay === null ? 'h-[clamp(240px,40vh,420px)]' : 'h-[clamp(300px,58vh,600px)]'} overflow-hidden transition-[height] duration-300 rounded-[28px] border-[5px] border-cream bg-sage-soft shadow-[var(--shadow-card)]`}>
      {view === 'island' ? (
        <Suspense fallback={<p className="absolute inset-x-0 top-1/2 text-center text-[13px] text-ink-soft">小島載入中…</p>}>
          <IslandScene
            trip={trip}
            openDay={openDay}
            selectedStopId={selectedStopId}
            onPickDay={onPickDay}
            onPickStop={onPickStop}
          />
        </Suspense>
      ) : hasMapsConfig ? (
        <TripMap trip={trip} openDay={openDay} selectedStopId={selectedStopId} onPickStop={onPickStop} />
      ) : (
        <div className="absolute inset-x-0 bottom-16 px-4 text-center text-[12px] text-ink-soft">
          尚未設定 Google 地圖：請見 docs/GOOGLE_MAPS_SETUP.md
        </div>
      )}

      <div
        role="tablist"
        aria-label="顯示方式"
        // On the map, sit above Google's logo, which must stay visible.
        className={`absolute left-3 z-10 flex rounded-full bg-cream/95 p-1 shadow-[var(--shadow-soft)] sm:left-4 ${
          view === 'map' ? 'bottom-9' : 'bottom-3 sm:bottom-4'
        }`}
      >
        {(['island', 'map'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => choose(v)}
            className={`rounded-full border-0 px-3.5 py-1 text-[13.5px] transition-colors ${
              view === v ? 'bg-sage text-white' : 'bg-transparent text-ink hover:text-sage-deep'
            }`}
          >
            {v === 'island' ? '小島' : '地圖'}
          </button>
        ))}
      </div>

      <div data-brand-chip className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-3 rounded-3xl bg-cream/95 py-2 pr-4 pl-2 shadow-[var(--shadow-soft)] sm:top-4 sm:left-4">
        <div className="grid size-12 place-items-center rounded-2xl bg-sage text-white sm:size-14">
          <span className="text-center leading-none">
            <b className="block text-[20px] sm:text-[24px]">{trip.days.length}</b>
            <span className="text-[11px]">天</span>
          </span>
        </div>
        <div>
          <div className="font-[family-name:var(--font-round)] text-[16px] sm:text-[19px]">{trip.destination}</div>
          <div className="flex items-center gap-2 text-[12px] text-ink-soft">
            <b className="text-sage-deep tabular-nums">
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
        className={`absolute top-3 right-3 z-10 rounded-full border-0 px-4 py-2 text-[14px] shadow-[var(--shadow-soft)] sm:top-4 sm:right-4 ${
          openDay === null ? 'bg-ink text-cream' : 'bg-cream/95 text-ink'
        }`}
      >
        全景
      </button>
    </div>
  )
}
