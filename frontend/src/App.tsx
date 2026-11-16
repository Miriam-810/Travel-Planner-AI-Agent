import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, buildTrip, createOutline, fetchSampleTrip, reviseOutline } from './api'
import { ErrorBox, GhostButton } from './components/Form'
import { GlobeHero } from './components/GlobeHero'
import { changedStops, outlineFromTrip, requestFromTrip } from './lib/editing'
import { loadLibrary, storeLibrary, tripStatus, withoutTrip, withTrip } from './lib/library'
import { KEYS, load, save } from './lib/storage'
import { Generating } from './pages/Generating'
import { OutlineReview } from './pages/OutlineReview'
import { EMPTY_DRAFT, type FormDraft } from './lib/formDraft'
import { RequestForm } from './pages/RequestForm'
import { TripPage } from './pages/TripPage'
import type { ChatTurn, OutlineResponse, Trip, TripOutline, TripRequest } from './types'

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
  /** When the outline came from "edit trip": the saved trip it will replace once rebuilt. */
  editingTripId: string | null
  /** The revision chat for the current outline, and earlier versions for undo (newest last). */
  chat: ChatTurn[]
  versions: TripOutline[]
  /** Stops the last revision added or moved, to highlight them. */
  changed: string[]
  /** Chat edits left today for this invite code, once known. */
  revisesLeft: number | null
}

const EMPTY_SESSION: Session = {
  view: 'form',
  draft: EMPTY_DRAFT,
  request: null,
  result: null,
  outline: null,
  trip: null,
  outlineTripId: null,
  editingTripId: null,
  chat: [],
  versions: [],
  changed: [],
  revisesLeft: null,
}

function message(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : String(err)
}

export default function App() {
  const [session, setSession] = useState<Session>(() => {
    const saved = load<Partial<Session>>(KEYS.session)
    // Older saves may lack newer draft fields (e.g. pace); fill them from the defaults.
    return {
      ...EMPTY_SESSION,
      ...saved,
      draft: { ...EMPTY_DRAFT, ...saved?.draft },
      // Saves from before this field existed: their trip was built from their outline.
      outlineTripId: saved?.outlineTripId !== undefined ? saved.outlineTripId : (saved?.trip?.id ?? null),
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
  const [revising, setRevising] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)
  const pendingRevision = useRef<AbortController | null>(null)

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
      update({
        request,
        result,
        outline: result.outline,
        trip: null,
        outlineTripId: null,
        editingTripId: null,
        chat: result.reply ? [{ role: 'assistant', text: result.reply }] : [],
        versions: [],
        changed: [],
        view: 'review',
      })
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
      // Rebuilding an outline that already made a trip replaces that trip rather than adding a second one.
      const replaces = session.editingTripId ?? session.outlineTripId ?? undefined
      update({ trip, outlineTripId: trip.id, editingTripId: null, changed: [], view: 'trip' })
      setLibrary((list) => withTrip(list, trip, session.request ?? undefined, replaces))
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

  /** Back to the outline page with a saved trip, to reorder, delete or ask the AI for changes. */
  const editTrip = (trip: Trip) => {
    const saved = library.find((e) => e.trip.id === trip.id)
    const outline = outlineFromTrip(trip)
    const result: OutlineResponse = {
      outline,
      warnings: [],
      remaining_today: 0,
      stats: { model: '', turns: 0, tool_calls: 0, searches: 0, claude_usd: null, places_usd: 0 },
    }
    update({
      request: saved?.request ?? requestFromTrip(trip),
      result,
      outline,
      editingTripId: trip.id,
      outlineTripId: null,
      chat: [],
      versions: [],
      changed: [],
    })
    go('review')
  }

  /** Ask the AI to change the outline. Earlier messages go along so "再改一次" makes sense. */
  const sendRevision = async (text: string) => {
    if (!session.request || !session.outline || revising) return
    const before = session.outline
    const history = session.chat.slice(-10)
    const ctrl = new AbortController()
    pendingRevision.current = ctrl
    setChatError(null)
    setRevising(true)
    update({ chat: [...session.chat, { role: 'user', text }] })
    try {
      const res = await reviseOutline(session.request, before, text, history, inviteCode.trim(), ctrl.signal)
      setSession((s) => ({
        ...s,
        outline: res.outline,
        result: s.result ? { ...s.result, warnings: res.warnings } : s.result,
        versions: [...s.versions, before].slice(-5),
        changed: changedStops(before, res.outline),
        chat: [...s.chat, { role: 'assistant', text: res.reply || '改好了，有變動的地方已經標出來。' }],
        revisesLeft: res.remaining_today,
      }))
    } catch (err) {
      if (ctrl.signal.aborted) return
      setChatError(message(err))
    } finally {
      pendingRevision.current = null
      setRevising(false)
    }
  }

  const cancelRevision = () => {
    pendingRevision.current?.abort()
    setRevising(false)
    setChatError('已取消。若 AI 已經開始修改，這次仍可能計入今天的修改次數。')
  }

  const undoRevision = () => {
    const previous = session.versions.at(-1)
    if (!previous) return
    update({
      outline: previous,
      versions: session.versions.slice(0, -1),
      changed: [],
      chat: [...session.chat, { role: 'assistant', text: '已經還原到上一版。' }],
    })
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
        onChange={(outline) => update({ outline, changed: [] })}
        onReset={() => update({ outline: session.result?.outline ?? null, changed: [], versions: [] })}
        onConfirm={confirm}
        onBack={() => (session.editingTripId ? go('trip') : go('form'))}
        editing={session.editingTripId !== null}
        backLabel={session.editingTripId ? '取消編輯' : '上一步'}
        confirmLabel={session.editingTripId ? '確認，更新行程' : '確認，產生行程'}
        chat={{
          messages: session.chat,
          busy: revising,
          error: chatError,
          left: session.revisesLeft,
          canUndo: session.versions.length > 0,
          changed: session.changed,
          onSend: sendRevision,
          onCancel: cancelRevision,
          onUndo: undoRevision,
        }}
      />
    )
  }

  if (view === 'trip' && session.trip) {
    return (
      <>
        <TopBar>
          <GhostButton onClick={() => go('form')}>← 回到地球</GhostButton>
          {tripStatus(session.trip) === 'planned' && (
            <GhostButton
              onClick={() =>
                // The outline this trip came from is still here (with its chat): go back to it as it was.
                session.outline && session.trip && session.outlineTripId === session.trip.id
                  ? (update({ editingTripId: session.trip.id }), go('review'))
                  : session.trip && editTrip(session.trip)
              }
            >
              編輯行程
            </GhostButton>
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
