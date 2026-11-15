import { useEffect, useRef, useState } from 'react'
import { DayItem } from '../components/DayItem'
import { MapPanel } from '../components/MapPanel'
import { palette, useTheme } from '../lib/themes'
import type { Trip } from '../types'

export function TripPage({ trip }: { trip: Trip }) {
  useTheme(trip.theme)
  // One day open at a time; null = overview with every day collapsed.
  const [openDay, setOpenDay] = useState<number | null>(null)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  // Set when a map pin is clicked, so the matching row scrolls into view after render.
  const scrollToStop = useRef<string | null>(null)

  const toggleDay = (i: number) => {
    setOpenDay((cur) => (cur === i ? null : i))
    setSelectedStopId(null)
  }

  const showOverview = () => {
    setOpenDay(null)
    setSelectedStopId(null)
  }

  const pickDay = (dayIndex: number) => {
    setOpenDay(dayIndex)
    setSelectedStopId(null)
  }

  const pickStopOnMap = (dayIndex: number, stopId: string) => {
    setOpenDay(dayIndex)
    setSelectedStopId(stopId)
    scrollToStop.current = stopId
  }

  useEffect(() => {
    const id = scrollToStop.current
    if (!id || id !== selectedStopId) return
    scrollToStop.current = null
    document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openDay, selectedStopId])

  const stopCount = trip.days.reduce((n, d) => n + d.stops.length, 0)

  return (
    <div className="mx-auto max-w-[880px] px-4 pb-16 sm:px-6">
      {/* Map stays on screen while the itinerary scrolls underneath. */}
      <div className="sticky top-0 z-20 -mx-4 bg-mist px-4 pt-3 pb-3 sm:-mx-6 sm:px-6 sm:pt-4">
        <MapPanel
          trip={trip}
          openDay={openDay}
          selectedStopId={selectedStopId}
          onPickDay={pickDay}
          onPickStop={pickStopOnMap}
          onOverview={showOverview}
        />
      </div>

      <header className="mt-4 mb-4 px-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="m-0 text-[26px] leading-tight sm:text-[30px]">{trip.destination}</h1>
          <span className="text-[13px] text-ink-soft">
            {trip.days.length} 天 ／ {stopCount} 個地點
          </span>
          <span className="rounded-full bg-sage-soft px-2.5 py-0.5 text-[12px] text-sage-deep">{palette(trip.theme).label}</span>
        </div>
        {trip.sample && (
          <p className="m-0 mt-2 inline-block rounded-full bg-cream px-3 py-0.5 text-[12px] text-ink-soft">
            範例資料・營業時間僅供示意
          </p>
        )}
      </header>

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {trip.days.map((day, i) => (
          <DayItem
            key={day.date}
            day={day}
            index={i}
            open={openDay === i}
            selectedStopId={selectedStopId}
            onToggle={() => toggleDay(i)}
            onSelectStop={setSelectedStopId}
          />
        ))}
      </ul>
    </div>
  )
}
