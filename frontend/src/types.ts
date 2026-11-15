// Mirrors backend/app/models.py (the finished Trip). Keep the two in sync.

export type StopKind = 'sight' | 'meal' | 'shop'
export type MealType = 'lunch' | 'dinner'

export interface Weather {
  source: 'forecast' | 'climate_avg'
  high_c: number
  low_c: number
  precip_mm: number | null
  summary: string
}

export interface PlaceHours {
  source: 'google_places'
  /** Hours on the planned date, e.g. "11:00–14:30, 17:00–21:00"; null if Google has none. */
  today_text: string | null
  /** Open for the whole planned stay; null when there is no hours data. */
  open_at_arrive: boolean | null
  business_status: string
  checked_at: string
}

export interface Stop {
  id: string
  name: string
  kind: StopKind
  meal: MealType | null
  place_id: string
  /** "HH:MM:SS" */
  arrive: string
  stay_min: number
  note: string
  lat: number
  lng: number
  maps_url: string | null
  hours: PlaceHours | null
}

export interface Day {
  /** "YYYY-MM-DD" */
  date: string
  title: string
  area: string
  weather: Weather | null
  lodging: string | null
  stops: Stop[]
  warnings: string[]
}

export interface Trip {
  id: string
  /** ISO 3166-1 alpha-2, e.g. "JP". Decides the map's region bias. */
  country: string
  destination: string
  start_date: string
  end_date: string
  travelers: number
  sample: boolean
  days: Day[]
}
