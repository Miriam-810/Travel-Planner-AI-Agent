// Mirrors backend/app/models.py (the finished Trip). Keep the two in sync.

export type StopKind = 'sight' | 'meal' | 'shop'
export type MealType = 'lunch' | 'dinner'

/** What the stop looks like on the trip island (backend SceneKind). Older trips have none. */
export type SceneKind =
  | 'ramen' | 'seafood' | 'cafe' | 'restaurant'
  | 'shrine' | 'temple' | 'castle' | 'onsen' | 'museum' | 'park' | 'nature' | 'viewpoint' | 'beach' | 'street'
  | 'market' | 'shop' | 'station' | 'landmark'

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

/** One ride within a transit leg. */
export interface LegStep {
  mode: 'walk' | 'train' | 'shinkansen' | 'subway' | 'tram' | 'bus' | 'ferry' | 'other'
  line: string
  from_name: string
  to_name: string
  minutes: number
}

/** How to get from one place to the next (backend Leg). */
export interface Leg {
  /** transit: rides found; walk: close enough to walk; far: only the distance and a map link. */
  mode: 'transit' | 'walk' | 'far'
  minutes: number | null
  distance_m: number
  summary: string
  steps: LegStep[]
  maps_url: string
}

export interface Stop {
  id: string
  name: string
  kind: StopKind
  scene?: SceneKind
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
  /** How to get here from the previous stop (or the hotel). Missing on older trips. */
  leg?: Leg | null
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
  /** From the last stop back to tonight's hotel, when its place is known. */
  leg_to_hotel?: Leg | null
}

export interface Trip {
  id: string
  /** ISO 3166-1 alpha-2, e.g. "JP". Decides the map's region bias. */
  country: string
  /** Colour palette picked by the AI, see lib/themes.ts. */
  theme: string
  destination: string
  start_date: string
  end_date: string
  travelers: number
  sample: boolean
  days: Day[]
}

// --- Request form and outline (backend: TripRequest, TripOutline, OutlineResponse) ---

export interface LodgingInput {
  name: string
  check_in: string
  check_out: string
  /** Set when picked from a hotel search, so the plan knows where each day ends. */
  place_id?: string | null
  lat?: number | null
  lng?: number | null
  /** Shown in the form only, to confirm the pick (the API ignores it). */
  address?: string | null
}

export interface HotelResult {
  place_id: string
  name: string
  address: string
  lat: number
  lng: number
}

export interface TripRequest {
  country: string
  destination: string
  start_date: string
  end_date: string
  /** "HH:MM" or null */
  arrival_time: string | null
  departure_time: string | null
  travelers: number
  budget_twd: number | null
  preferences: string[]
  lodgings: LodgingInput[]
}

export interface StopDraft {
  name: string
  kind: StopKind
  scene?: SceneKind
  meal: MealType | null
  place_id: string
  /** "HH:MM" or "HH:MM:SS" */
  arrive: string
  stay_min: number
  note: string
}

export interface DayDraft {
  date: string
  title: string
  area: string
  area_lat: number
  area_lng: number
  stops: StopDraft[]
}

export interface TripOutline {
  theme: string
  days: DayDraft[]
}

/** One message in the outline-revision chat. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface OutlineResponse {
  outline: TripOutline
  warnings: string[]
  remaining_today: number
  /** The AI's note: the plan's idea, or what a revision changed. */
  reply?: string
  stats: {
    model: string
    turns: number
    tool_calls: number
    searches: number
    claude_usd: number | null
    places_usd: number
  }
}
