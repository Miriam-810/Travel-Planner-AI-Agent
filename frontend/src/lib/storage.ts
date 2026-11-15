// Per-browser conveniences: the invite code, and the last plan so a refresh
// doesn't throw away an outline the owner already paid for. Storage can be
// unavailable (private mode, blocked site data), so every access is guarded.

export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function save(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not fatal: the app works without storage, it just forgets on reload.
  }
}

export const KEYS = {
  invite: 'tp.invite',
  session: 'tp.session',
} as const
