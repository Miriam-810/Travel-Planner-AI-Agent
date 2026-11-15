import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, buildTrip, createOutline, fetchSampleTrip } from './api'
import { ErrorBox, GhostButton } from './components/Form'
import { GlobeHero } from './components/GlobeHero'
import { loadLibrary, storeLibrary, withoutTrip, withTrip } from './lib/library'
import { KEYS, load, save } from './lib/storage'
import { Generating } from './pages/Generating'
import { OutlineReview } from './pages/OutlineReview'
import { EMPTY_DRAFT, type FormDraft } from './lib/formDraft'
import { RequestForm } from './pages/RequestForm'
import { TripPage } from './pages/TripPage'
import type { OutlineResponse, Trip, TripOutline, TripRequest } from './types'

type View = 'form' | 'generating' | 'review' | 'trip' | 'sample'

/** What survives a reload: the form, and the last outline and trip. */
interface Session {
  view: 'form' | 'review' | 'trip'
  draft: FormDraft
  request: TripRequest | null
  result: OutlineResponse | null
  outline: TripOutline | null
  /** The trip on screen; may be one opened from the globe rather than the one built from the outline. */
  trip: Trip | null
  /** Id of the trip built from the current outline, so "back to outline" only shows for that trip. */
  outlineTripId: string | null
}

const EMPTY_SESSION: Session = {
  view: 'form',
  draft: EMPTY_DRAFT,
  request: null,
  result: null,
  outline: null,
  trip: null,
  outlineTripId: null,
}

function message(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : String(err)
}

export default function App() {
  const [session, setSession] = useState<Session>(() => {
    const saved = load<Session>(KEYS.session)
    // Older saves may lack newer draft fields (e.g. pace); fill them from the defaults.
    return {
      ...EMPTY_SESSION,
      ...saved,
      draft: { ...EMPTY_DRAFT, ...saved?.draft },
      outlineTripId: saved?.outlineTripId ?? saved?.trip?.id ?? null,
    }
  })
  // Every trip planned on this device; a trip saved before the library existed joins it.
  const [library, setLibrary] = useState(() => {
    const list = loadLibrary()
    return session.trip && !list.some((e) => e.trip.id === session.trip?.id) ? withTrip(list, session.trip) : list
  })
  const [view, setView] = useState<View>(session.view)
  const [inviteCode, setInviteCode] = useState(() => load<string>(KEYS.invite) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  const [sample, setSample] = useState<Trip | null>(null)
  const pending = useRef<AbortController | null>(null)

  useEffect(() => {
    save(KEYS.session, session)
  }, [session])
  useEffect(() => {
    storeLibrary(library)
  }, [library])
  useEffect(() => {
    save(KEYS.invite, inviteCode.trim() || null)
  }, [inviteCode])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view])

  const update = (patch: Partial<Session>) => setSession((s) => ({ ...s, ...patch }))

  const go = (next: View) => {
    setError(null)
    setView(next)
    if (next === 'form' || next === 'review' || next === 'trip') update({ view: next })
  }

  const generate = async (request: TripRequest) => {
    const ctrl = new AbortController()
    pending.current = ctrl
    setError(null)
    setView('generating')
    try {
      const result = await createOutline(request, inviteCode.trim(), ctrl.signal)
      update({ request, result, outline: result.outline, trip: null, view: 'review' })
      setView('review')
    } catch (err) {
      if (ctrl.signal.aborted) return
      setError(message(err))
      setView('form')
    } finally {
      pending.current = null
    }
  }

  const cancel = () => {
    pending.current?.abort()
    setView('form')
    setError('已取消。若伺服器已經開始規劃，這次仍可能計入今天的額度。')
  }

  const confirm = async () => {
    if (!session.request || !session.outline) return
    setBuilding(true)
    setError(null)
    try {
      const trip = await buildTrip(session.request, session.outline, inviteCode.trim())
      update({ trip, outlineTripId: trip.id, view: 'trip' })
      setLibrary((list) => withTrip(list, trip))
      setView('trip')
    } catch (err) {
      setError(message(err))
    } finally {
      setBuilding(false)
    }
  }

  const showSample = async () => {
    setError(null)
    setView('sample')
    if (sample) return
    try {
      setSample(await fetchSampleTrip())
    } catch (err) {
      setError(message(err))
    }
  }

  const openTrip = (id: string) => {
    const saved = library.find((e) => e.trip.id === id)
    if (!saved) return
    update({ trip: saved.trip })
    go('trip')
  }

  const removeTrip = (id: string) => {
    setLibrary((list) => withoutTrip(list, id))
    if (session.trip?.id === id) update({ trip: null })
  }

  const startOver = () => {
    update({ ...EMPTY_SESSION, draft: session.draft })
    go('form')
  }

  if (view === 'generating') {
    return <Generating destination={session.draft.destination || '你的行程'} onCancel={cancel} />
  }

  if (view === 'review' && session.request && session.result && session.outline) {
    return (
      <OutlineReview
        request={session.request}
        outline={session.outline}
        edited={JSON.stringify(session.outline) !== JSON.stringify(session.result.outline)}
        warnings={session.result.warnings}
        busy={building}
        error={error}
        onChange={(outline) => update({ outline })}
        onReset={() => update({ outline: session.result?.outline ?? null })}
        onConfirm={confirm}
        onBack={() => go('form')}
      />
    )
  }

  if (view === 'trip' && session.trip) {
    return (
      <>
        <TopBar>
          <GhostButton onClick={() => go('form')}>← 回到地球</GhostButton>
          {session.outline && session.outlineTripId === session.trip.id && (
            <GhostButton onClick={() => go('review')}>回到大綱</GhostButton>
          )}
          <GhostButton onClick={startOver}>規劃新行程</GhostButton>
        </TopBar>
        <TripPage trip={session.trip} />
      </>
    )
  }

  if (view === 'sample') {
    return (
      <>
        <TopBar>
          <GhostButton onClick={() => go('form')}>← 規劃自己的行程</GhostButton>
        </TopBar>
        {sample ? (
          <TripPage trip={sample} />
        ) : error ? (
          <div className="mx-auto max-w-md p-8">
            <ErrorBox>{error}</ErrorBox>
          </div>
        ) : (
          <p className="p-8 text-center text-ink-soft">讀取範例行程中…</p>
        )}
      </>
    )
  }

  return (
    <RequestForm
      draft={session.draft}
      onDraftChange={(draft) => update({ draft })}
      inviteCode={inviteCode}
      onInviteChange={setInviteCode}
      error={error}
      onSubmit={generate}
      onShowSample={showSample}
      globe={<GlobeHero trips={library} onOpen={openTrip} onRemove={removeTrip} />}
      onResume={
        session.result && session.request && session.outlineTripId === null
          ? { label: `回到上次的大綱：${session.request.destination}`, go: () => go('review') }
          : undefined
      }
    />
  )
}

function TopBar({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-[880px] flex-wrap gap-2 px-4 pt-3 sm:px-6">{children}</div>
}
