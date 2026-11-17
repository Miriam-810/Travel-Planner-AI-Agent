import { useRef, useState } from 'react'
import { ApiError, searchHotels } from '../api'
import type { HotelResult } from '../types'
import { GhostButton, IconInput } from './Form'
import { Icon } from './Icon'

interface Props {
  index: number
  name: string
  /** The address of the hotel picked from the search, or null if typed by hand. */
  pickedAddress: string | null
  destination: string
  inviteCode: string
  onType: (name: string) => void
  onPick: (hotel: HotelResult) => void
}

/**
 * A hotel name field with a search: picking a result keeps the hotel's place,
 * so the plan can end each day near it. Typing a name by hand still works
 * (small inns may not be on the map).
 */
export function HotelSearch({ index, name, pickedAddress, destination, inviteCode, onType, onPick }: Props) {
  const [results, setResults] = useState<HotelResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)

  const search = async () => {
    const q = name.trim()
    if (q.length < 2) {
      setError('先輸入飯店名稱（至少兩個字）')
      return
    }
    pending.current?.abort()
    const ctrl = new AbortController()
    pending.current = ctrl
    setBusy(true)
    setError(null)
    try {
      const found = await searchHotels(q, destination, inviteCode.trim(), ctrl.signal)
      setResults(found)
      if (found.length === 0) setError('找不到這間，可以直接用輸入的名稱')
    } catch (err) {
      if (ctrl.signal.aborted) return
      setError(err instanceof ApiError ? err.message : '搜尋失敗，可以直接用輸入的名稱')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <IconInput
            icon="bed"
            aria-label={`住宿 ${index + 1} 名稱`}
            value={name}
            maxLength={100}
            placeholder="飯店名稱，例如 Dormy Inn 函館"
            onChange={(e) => {
              setResults(null)
              onType(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                void search()
              }
            }}
          />
        </div>
        <GhostButton onClick={() => void search()}>{busy ? '搜尋中…' : '搜尋'}</GhostButton>
      </div>

      {pickedAddress && !results && (
        <p className="m-0 flex items-center gap-1.5 px-1 text-[12.5px] text-sage-deep">
          <Icon name="check" size={14} />
          <span className="truncate">已確認位置：{pickedAddress}</span>
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 rounded-2xl bg-cream p-1.5 shadow-[var(--shadow-soft)]" aria-label="搜尋結果">
          {results.map((h) => (
            <li key={h.place_id}>
              <button
                type="button"
                onClick={() => {
                  onPick(h)
                  setResults(null)
                }}
                className="flex w-full flex-col items-start rounded-xl border-0 bg-transparent px-3 py-2 text-left hover:bg-sage-soft"
              >
                <span className="text-[14.5px] text-ink">{h.name}</span>
                <span className="text-[12px] text-ink-soft">{h.address}</span>
              </button>
            </li>
          ))}
          <li className="px-3 pt-1 pb-1.5 text-[12px] text-ink-soft">都不是的話，直接用輸入的名稱也可以</li>
        </ul>
      )}

      {error && <p className="m-0 px-1 text-[12.5px] text-apricot-deep">{error}</p>}
    </div>
  )
}
