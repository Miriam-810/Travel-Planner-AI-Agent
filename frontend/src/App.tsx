import { useEffect, useState } from 'react'
import { fetchSampleTrip } from './api'
import { TripPage } from './pages/TripPage'
import type { Trip } from './types'

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; trip: Trip }

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const ctrl = new AbortController()
    fetchSampleTrip(ctrl.signal)
      .then((trip) => setState({ status: 'ready', trip }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => ctrl.abort()
  }, [])

  if (state.status === 'loading') {
    return <p className="p-8 text-center text-ink-soft">讀取行程中…</p>
  }
  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="font-bold">{state.message}</p>
        <p className="text-[13px] text-ink-soft">請確認後端有在 http://localhost:8000 執行。</p>
      </div>
    )
  }
  return <TripPage trip={state.trip} />
}
