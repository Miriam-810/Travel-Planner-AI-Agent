import type { ChatTurn, HotelResult, OutlineResponse, Trip, TripOutline, TripRequest } from './types'

/** An error whose message is ready to show to the user, in Chinese. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit & { inviteCode?: string } = {}): Promise<T> {
  const { inviteCode, ...rest } = init
  const headers = new Headers(rest.headers)
  if (rest.body) headers.set('Content-Type', 'application/json')
  if (inviteCode) headers.set('X-Invite-Code', inviteCode)

  let res: Response
  try {
    res = await fetch(path, { ...rest, headers })
  } catch (err) {
    if (rest.signal?.aborted) throw err
    throw new ApiError(0, '連不上伺服器，請確認網路或稍後再試。')
  }
  if (res.ok) return res.json() as Promise<T>
  throw new ApiError(res.status, await errorMessage(res))
}

async function errorMessage(res: Response): Promise<string> {
  let detail: unknown
  try {
    detail = ((await res.json()) as { detail?: unknown }).detail
  } catch {
    detail = undefined
  }
  switch (res.status) {
    case 401:
      return '邀請碼無效，請確認後再試一次。'
    case 429:
      return `${typeof detail === 'string' ? detail : '今天的額度用完了'}，日本時間午夜後會重置。`
    case 422:
      // FastAPI validation errors come as a list; our own checks as a string.
      return typeof detail === 'string' ? `資料有誤：${detail}` : '有欄位格式不正確，請檢查後再送出。'
    case 503:
      return '伺服器尚未設定完成，請聯絡網站作者。'
    default:
      return typeof detail === 'string' ? detail : `伺服器發生錯誤（HTTP ${res.status}），請稍後再試。`
  }
}

export function fetchSampleTrip(signal?: AbortSignal): Promise<Trip> {
  return request<Trip>('/api/trips/sample', { signal })
}

export function checkInvite(inviteCode: string, signal?: AbortSignal): Promise<{ remaining_today: number }> {
  return request('/api/invite', { inviteCode, signal })
}

/** Find a booked hotel by name (one search; it has its own daily limit). */
export function searchHotels(q: string, destination: string, inviteCode: string, signal?: AbortSignal): Promise<HotelResult[]> {
  return request('/api/hotels', { method: 'POST', body: JSON.stringify({ q, destination }), inviteCode, signal })
}

export function createOutline(trip: TripRequest, inviteCode: string, signal?: AbortSignal): Promise<OutlineResponse> {
  return request('/api/outline', { method: 'POST', body: JSON.stringify(trip), inviteCode, signal })
}

/** Ask the AI to change an outline, from a chat message. Has its own daily limit. */
export function reviseOutline(
  trip: TripRequest,
  outline: TripOutline,
  message: string,
  history: ChatTurn[],
  inviteCode: string,
  signal?: AbortSignal,
): Promise<OutlineResponse> {
  return request('/api/outline/revise', {
    method: 'POST',
    body: JSON.stringify({ request: trip, outline, message, history }),
    inviteCode,
    signal,
  })
}

export function buildTrip(
  trip: TripRequest,
  outline: TripOutline,
  inviteCode: string,
  signal?: AbortSignal,
): Promise<Trip> {
  return request('/api/trips', {
    method: 'POST',
    body: JSON.stringify({ request: trip, outline }),
    inviteCode,
    signal,
  })
}
