import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  APIProvider,
  ControlPosition,
  Map,
  Polyline,
  useMap,
} from '@vis.gl/react-google-maps'
import { useEffect, useMemo, useState } from 'react'
import { MAP_ID, MAPS_API_KEY } from '../lib/mapsConfig'
import { palette } from '../lib/themes'
import type { Stop, Trip } from '../types'

// Keep pins clear of the brand chip (top-left, measured from the DOM), the
// overview button and the zoom control (right).
function fitPadding(map: google.maps.Map): google.maps.Padding {
  const mapDiv = map.getDiv()
  const chip = mapDiv.closest('[data-map-frame]')?.querySelector('[data-brand-chip]')
  const chipBottom = chip ? chip.getBoundingClientRect().bottom - mapDiv.getBoundingClientRect().top : 100
  return { top: Math.round(chipBottom + 20), right: 64, bottom: 32, left: 32 }
}

type LatLng = { lat: number; lng: number }

const toLatLng = (s: Stop): LatLng => ({ lat: s.lat, lng: s.lng })

interface Props {
  trip: Trip
  openDay: number | null
  selectedStopId: string | null
  onPickStop: (dayIndex: number, stopId: string) => void
}

export function TripMap(props: Props) {
  const first = props.trip.days[0]?.stops[0]
  return (
    <APIProvider apiKey={MAPS_API_KEY} language="zh-TW" region={props.trip.country}>
      <Map
        mapId={MAP_ID}
        defaultCenter={first ? toLatLng(first) : { lat: 36.2, lng: 138.2 }}
        defaultZoom={8}
        disableDefaultUI
        zoomControl
        zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
        gestureHandling="cooperative"
        clickableIcons={false}
        className="size-full"
      >
        <MapContents {...props} />
      </Map>
    </APIProvider>
  )
}

function MapContents({ trip, openDay, selectedStopId, onPickStop }: Props) {
  const visibleDays = openDay === null ? trip.days.map((d, i) => ({ day: d, index: i })) : [{ day: trip.days[openDay], index: openDay }]

  const selected = useMemo(() => {
    for (const d of trip.days) {
      const s = d.stops.find((x) => x.id === selectedStopId)
      if (s) return toLatLng(s)
    }
    return null
  }, [trip, selectedStopId])

  const framePoints = useMemo(
    () => (openDay === null ? trip.days : [trip.days[openDay]]).flatMap((d) => d.stops.map(toLatLng)),
    [trip, openDay],
  )

  return (
    <>
      <Camera points={framePoints} focus={selected} />

      {visibleDays.map(({ day }) => (
        <RouteLine key={day.date} path={day.stops.map(toLatLng)} active={openDay !== null} theme={trip.theme} />
      ))}

      {visibleDays.map(({ day, index }) =>
        day.stops.map((stop, i) => {
          const isSelected = stop.id === selectedStopId
          return (
            <AdvancedMarker
              key={stop.id}
              position={toLatLng(stop)}
              title={`${stop.name}（第 ${index + 1} 天）`}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              zIndex={isSelected ? 1000 : openDay === null ? 1 : 10 + i}
              onClick={() => onPickStop(index, stop.id)}
            >
              {openDay === null ? (
                <span className="map-dot" />
              ) : (
                <span className={`map-pin${isSelected ? ' is-selected' : ''}`}>{i + 1}</span>
              )}
            </AdvancedMarker>
          )
        }),
      )}
    </>
  )
}

/** Fits the map to the visible stops, and pans to the selected stop. */
function Camera({ points, focus }: { points: LatLng[]; focus: LatLng | null }) {
  const map = useMap()

  // points and focus are memoized by the parent, so these run only when the
  // open day or the selected stop changes.
  useEffect(() => {
    if (!map || points.length === 0) return
    if (points.length === 1) {
      map.panTo(points[0])
      map.setZoom(15)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    points.forEach((p) => bounds.extend(p))
    map.fitBounds(bounds, fitPadding(map))
  }, [map, points])

  useEffect(() => {
    if (map && focus) map.panTo(focus)
  }, [map, focus])

  return null
}

/** Dashed route between stops. The open day's route is the accent colour and "marches". */
function RouteLine({ path, active, theme }: { path: LatLng[]; active: boolean; theme: string }) {
  const offset = useMarchingOffset(active)
  const color = active ? palette(theme).accentDeep : '#FFFFFF'
  return (
    <Polyline
      path={path}
      strokeOpacity={0}
      zIndex={active ? 5 : 1}
      icons={[
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: active ? 1 : 0.85, strokeColor: color, scale: active ? 3.5 : 2.5 },
          offset: `${offset}px`,
          repeat: active ? '16px' : '12px',
        },
      ]}
    />
  )
}

function useMarchingOffset(active: boolean) {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setOffset((o) => (o + 1) % 16), 60)
    return () => window.clearInterval(id)
  }, [active])
  return active ? offset : 0
}
