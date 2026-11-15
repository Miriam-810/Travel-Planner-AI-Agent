import type { LodgingInput } from '../types'

/** What the inputs hold while editing: numbers stay strings until submit. */
export interface FormDraft {
  destination: string
  start_date: string
  end_date: string
  arrival_time: string
  departure_time: string
  travelers: string
  budget_twd: string
  preferences: string[]
  lodgings: LodgingInput[]
}

export const EMPTY_DRAFT: FormDraft = {
  destination: '',
  start_date: '',
  end_date: '',
  arrival_time: '',
  departure_time: '',
  travelers: '2',
  budget_twd: '',
  preferences: [],
  lodgings: [],
}
