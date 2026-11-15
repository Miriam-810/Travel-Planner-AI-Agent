import type { Trip } from './types'

export async function fetchSampleTrip(signal?: AbortSignal): Promise<Trip> {
  const res = await fetch('/api/trips/sample', { signal })
  if (!res.ok) {
    throw new Error(`讀取範例行程失敗（HTTP ${res.status}）`)
  }
  return res.json() as Promise<Trip>
}
