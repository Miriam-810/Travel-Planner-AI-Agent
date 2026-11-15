import { lazy, Suspense, useState } from 'react'
import { monthDay } from '../lib/format'
import { tripStatus, type SavedTrip } from '../lib/library'
import { palette } from '../lib/themes'
import { Icon } from './Icon'

const GlobeScene = lazy(() => import('../globe/GlobeScene'))

const STATUS_TEXT = { planned: '搭建中', built: '已建成' } as const

interface Props {
  trips: SavedTrip[]
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

/** The night globe on the home page, with an island for every trip planned on this device. */
export function GlobeHero({ trips, onOpen, onRemove }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const hoveredTrip = trips.find((e) => e.trip.id === hovered)?.trip

  return (
    <section className="mb-8">
      <div className="relative h-[clamp(260px,42vh,400px)] overflow-hidden rounded-[28px] bg-[radial-gradient(120%_90%_at_50%_30%,#1d2c47_0%,#0f1729_60%,#0a1020_100%)] shadow-[var(--shadow-card)]">
        <Suspense fallback={null}>
          <GlobeScene trips={trips} onOpen={onOpen} onHover={setHovered} />
        </Suspense>

        <p className="pointer-events-none absolute inset-x-0 bottom-4 m-0 px-4 text-center text-[13.5px] text-white/70">
          {hoveredTrip ? (
            <>
              <span className="text-white">{hoveredTrip.destination}</span>・{monthDay(hoveredTrip.start_date)}–{monthDay(hoveredTrip.end_date)}・
              {STATUS_TEXT[tripStatus(hoveredTrip)]}
            </>
          ) : trips.length === 0 ? (
            '完成第一趟規劃，地球上就會長出第一座小島'
          ) : (
            '拖曳轉動地球，點小島打開行程'
          )}
        </p>
      </div>

      {trips.length > 0 && (
        <>
          <ul className="m-0 mt-3 flex list-none flex-wrap justify-center gap-2 p-0">
            {trips.map(({ trip }) => {
              const status = tripStatus(trip)
              return (
                <li key={trip.id} className="flex items-center rounded-full bg-cream shadow-[var(--shadow-soft)]">
                  <button
                    type="button"
                    onClick={() => onOpen(trip.id)}
                    className="flex items-center gap-2 rounded-full border-0 bg-transparent py-1.5 pr-1 pl-3 text-[14px] text-ink hover:text-sage-deep"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{
                        background: status === 'built' ? palette(trip.theme).accent : 'transparent',
                        boxShadow: `inset 0 0 0 1.5px ${palette(trip.theme).accent}`,
                      }}
                    />
                    {trip.destination}
                    <span className="text-[12px] text-ink-soft tabular-nums">
                      {monthDay(trip.start_date)}・{STATUS_TEXT[status]}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`從地球移除「${trip.destination}」`}
                    title="移除"
                    onClick={() => {
                      if (window.confirm(`要從地球移除「${trip.destination}」嗎？移除後無法復原。`)) onRemove(trip.id)
                    }}
                    className="mr-1 grid size-7 place-items-center rounded-full border-0 bg-transparent text-ink-soft hover:bg-field hover:text-ink"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="m-0 mt-2 text-center text-[12px] text-ink-soft">行程存在這台裝置上，清除瀏覽器資料會一起刪掉。</p>
        </>
      )}
    </section>
  )
}
