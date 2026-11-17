import { lazy, Suspense, useMemo, useState } from 'react'
import { monthDay } from '../lib/format'
import { statusOf, type SavedTrip } from '../lib/library'
import { palette } from '../lib/themes'
import { Icon } from './Icon'

const GlobeScene = lazy(() => import('../globe/GlobeScene'))
const CountryScene = lazy(() => import('../island/IslandScene').then((m) => ({ default: m.CountryScene })))

/** The globe passes up "country:JP" when a country's island is clicked. */
const COUNTRY_PREFIX = 'country:'
const COUNTRY_NAME: Record<string, string> = { JP: '日本', TW: '台灣', KR: '韓國' }

const STATUS_TEXT = { planned: '搭建中', built: '已建成' } as const

interface Props {
  trips: SavedTrip[]
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

/** The globe on the home page, with an island for every trip planned on this device. */
export function GlobeHero({ trips, onOpen, onRemove }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  // Clicking a country's island on the globe opens that country's map (second level).
  const [country, setCountry] = useState<string | null>(null)
  const hoveredEntry = trips.find((e) => e.trip.id === hovered)
  const hoveredTrip = hoveredEntry?.trip
  const hoveredCountry = hovered?.startsWith(COUNTRY_PREFIX) ? hovered.slice(COUNTRY_PREFIX.length) : null
  // Kept stable across hovers: a new list would rebuild the whole country map (and make it flash).
  const countryTrips = useMemo(() => (country ? trips.filter((e) => e.trip.country === country) : []), [trips, country])
  const tripsIn = (code: string) => trips.filter((e) => e.trip.country === code)

  return (
    // Wider than the form on large screens: the globe is the page's centrepiece.
    <section className="relative left-1/2 mb-8 w-[min(920px,calc(100vw-32px))] -translate-x-1/2">
      <div className="relative h-[clamp(300px,46vh,420px)] overflow-hidden rounded-[28px] bg-[#05070d] shadow-[var(--shadow-card)] sm:h-[clamp(380px,62vh,620px)]">
        <Suspense
          fallback={<p className="absolute inset-0 m-0 grid place-items-center text-[13px] text-white/50">地球載入中…</p>}
        >
          {country && countryTrips.length > 0 ? (
            <CountryScene trips={countryTrips} onOpen={onOpen} onHover={setHovered} />
          ) : (
            <GlobeScene
              trips={trips}
              onOpen={(id) => (id.startsWith(COUNTRY_PREFIX) ? setCountry(id.slice(COUNTRY_PREFIX.length)) : onOpen(id))}
              onHover={setHovered}
            />
          )}
        </Suspense>

        {country && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 sm:top-4 sm:left-4">
            <button
              type="button"
              onClick={() => {
                setCountry(null)
                setHovered(null)
              }}
              className="rounded-full border-0 bg-cream/95 px-4 py-2 text-[14px] text-ink shadow-[var(--shadow-soft)] hover:text-sage-deep"
            >
              ← 回到地球
            </button>
            <span className="rounded-full bg-cream/95 px-3 py-1.5 text-[13px] text-ink-soft shadow-[var(--shadow-soft)]">
              {COUNTRY_NAME[country] ?? country}・{countryTrips.length} 趟
            </span>
          </div>
        )}

        <p
          className={`pointer-events-none absolute inset-x-0 bottom-4 m-0 px-4 text-center text-[13.5px] ${
            country ? 'text-ink' : 'text-white/70'
          }`}
        >
          {hoveredCountry ? (
            <>
              <span className="text-white">{COUNTRY_NAME[hoveredCountry] ?? hoveredCountry}</span>・{tripsIn(hoveredCountry).length} 趟行程・點一下看地圖
            </>
          ) : hoveredTrip ? (
            <>
              <span className={country ? 'text-sage-deep' : 'text-white'}>{hoveredTrip.destination}</span>・{monthDay(hoveredTrip.start_date)}–{monthDay(hoveredTrip.end_date)}・
              {STATUS_TEXT[statusOf(hoveredEntry!)]}
            </>
          ) : trips.length === 0 ? (
            '完成第一趟規劃，地球上就會長出第一座小島'
          ) : (
            country ? '點小島打開行程' : '拖曳轉動地球，點國家的小島看地圖'
          )}
        </p>
      </div>

      {trips.length > 0 && (
        <>
          <ul className="m-0 mt-3 flex list-none flex-wrap justify-center gap-2 p-0">
            {trips.map((entry) => {
              const { trip } = entry
              const status = statusOf(entry)
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
