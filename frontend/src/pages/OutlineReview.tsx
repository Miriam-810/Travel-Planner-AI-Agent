import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { KindBadge } from '../components/Badges'
import { ErrorBox, PrimaryButton, TextButton } from '../components/Form'
import { Icon, type IconName } from '../components/Icon'
import { hhmm, monthDay, weekdayZh, zhNumber } from '../lib/format'
import { palette, useTheme } from '../lib/themes'
import type { DayDraft, TripOutline, TripRequest } from '../types'

interface Props {
  request: TripRequest
  outline: TripOutline
  edited: boolean
  warnings: string[]
  busy: boolean
  error: string | null
  onChange: (outline: TripOutline) => void
  onReset: () => void
  onConfirm: () => void
  onBack: () => void
}

/** Move a stop to a new position. Time slots stay where they are; the stops shift through them. */
function moveStop(day: DayDraft, from: number, to: number): DayDraft {
  const slots = day.stops.map((s) => s.arrive)
  const stops = [...day.stops]
  const [moved] = stops.splice(from, 1)
  stops.splice(to, 0, moved)
  return { ...day, stops: stops.map((s, i) => ({ ...s, arrive: slots[i] })) }
}

export function OutlineReview({ request, outline, edited, warnings, busy, error, onChange, onReset, onConfirm, onBack }: Props) {
  useTheme(outline.theme)
  const updateDay = (i: number, day: DayDraft) =>
    onChange({ ...outline, days: outline.days.map((d, j) => (j === i ? day : d)) })
  const stopCount = outline.days.reduce((n, d) => n + d.stops.length, 0)

  return (
    <div className="mx-auto max-w-[720px] px-4 pt-8 pb-36 sm:px-6">
      <header className="mb-5 px-1">
        <p className="m-0 text-[13px] text-ink-soft">大綱完成了，看看喜不喜歡</p>
        <h1 className="m-0 mt-1 text-[26px] leading-tight sm:text-[30px]">{request.destination}</h1>
        <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-soft tabular-nums">
          {monthDay(request.start_date)}–{monthDay(request.end_date)}・{outline.days.length} 天・{stopCount} 個地點
          <span className="rounded-full bg-sage-soft px-2.5 py-0.5 text-[12px] text-sage-deep">配色：{palette(outline.theme).label}</span>
        </p>
        <p className="m-0 mt-3 text-[14.5px] text-ink">
          可以調整順序或刪掉不想去的地方，確認後會補上天氣、營業時間和地圖。
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-3xl bg-apricot-soft px-4 py-3 text-[14px] text-apricot-deep">
          <p className="m-0 mb-1">AI 重排後仍有這些問題，請留意：</p>
          {warnings.map((w) => (
            <p key={w} className="m-0">
              ! {w}
            </p>
          ))}
        </div>
      )}

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {outline.days.map((day, di) => (
          <li key={day.date} className="rounded-[28px] bg-cream p-4 shadow-[var(--shadow-soft)] sm:p-5">
            <div className="mb-2 grid grid-cols-[44px_1fr_auto] items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-sage-soft text-[18px] font-bold text-sage-deep tabular-nums">
                {di + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] text-ink-soft">
                  第{zhNumber(di + 1)}天・{day.area}
                </span>
                <span className="block font-[family-name:var(--font-round)] text-[16.5px] leading-snug">{day.title}</span>
              </span>
              <span className="text-right text-[12px] leading-tight text-ink-soft tabular-nums">
                <b className="block text-[13px] text-ink">{monthDay(day.date)}</b>
                週{weekdayZh(day.date)}
              </span>
            </div>

            <StopList day={day} onChange={(d) => updateDay(di, d)} />
          </li>
        ))}
      </ol>

      {/* Actions stay reachable at the bottom of the screen on long outlines. */}
      <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
        <div className="mx-auto flex max-w-[720px] flex-col gap-2 rounded-[28px] bg-cream/95 px-4 py-3 shadow-[var(--shadow-card)] backdrop-blur">
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex">
              <TextButton onClick={onBack}>上一步</TextButton>
              {edited && <TextButton onClick={onReset}>還原</TextButton>}
            </div>
            <PrimaryButton disabled={busy} onClick={onConfirm}>
              {busy ? '產生中…' : '確認，產生行程'}
            </PrimaryButton>
          </div>
          {edited && (
            <p className="m-0 text-[12.5px] text-ink-soft">調整順序時時段不變，地點依新順序填入；營業時間會在下一步重新檢查。</p>
          )}
        </div>
      </div>
    </div>
  )
}

interface Drag {
  from: number
  over: number
  dy: number
  height: number
}

/** One day's stops. Drag a row by its handle (or use the arrow keys on it) to reorder. */
function StopList({ day, onChange }: { day: DayDraft; onChange: (day: DayDraft) => void }) {
  const list = useRef<HTMLOListElement>(null)
  const start = useRef({ y: 0, mids: [] as number[] })
  const [drag, setDrag] = useState<Drag | null>(null)

  const rows = () => [...(list.current?.children ?? [])] as HTMLElement[]

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (e.button !== 0) return
    e.preventDefault() // no text selection or scrolling while dragging; that also skips focus, so focus by hand
    e.currentTarget.focus()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rects = rows().map((r) => r.getBoundingClientRect())
    start.current = { y: e.clientY, mids: rects.map((r) => r.top + r.height / 2) }
    setDrag({ from: i, over: i, dy: 0, height: rects[i].height })
  }

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return
    const { y, mids } = start.current
    const dy = e.clientY - y
    const centre = mids[drag.from] + dy
    let over = drag.from
    mids.forEach((m, k) => {
      if (k > drag.from && centre > m) over = k
      if (k < drag.from && centre < m && over >= drag.from) over = k
    })
    setDrag({ ...drag, dy, over })
  }

  const onPointerUp = () => {
    if (drag && drag.over !== drag.from) onChange(moveStop(day, drag.from, drag.over))
    setDrag(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null
    if (to === null || to < 0 || to >= day.stops.length) return
    e.preventDefault()
    onChange(moveStop(day, i, to))
    requestAnimationFrame(() => rows()[to]?.querySelector<HTMLButtonElement>('[data-grip]')?.focus())
  }

  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0
    if (drag.from < i && i <= drag.over) return -drag.height
    if (drag.over <= i && i < drag.from) return drag.height
    return 0
  }

  return (
    <ol ref={list} className="m-0 flex list-none flex-col p-0">
      {day.stops.map((stop, si) => {
        const dragging = drag?.from === si
        return (
          <li
            key={`${stop.place_id}-${stop.name}`}
            style={{ transform: `translateY(${dragging ? drag.dy : shift(si)}px)` }}
            className={`relative grid grid-cols-[48px_1fr_auto] items-start gap-2 border-t border-line/70 py-3 first:border-t-0 ${
              dragging
                ? 'z-10 rounded-2xl border-transparent bg-cream shadow-[var(--shadow-card)]'
                : drag
                  ? 'transition-transform duration-150'
                  : ''
            }`}
          >
            <span className="pt-0.5 text-[14px] font-bold tabular-nums">{hhmm(stop.arrive)}</span>
            <span className="min-w-0">
              <span className="block font-[family-name:var(--font-round)] text-[15px] leading-snug">
                <KindBadge stop={stop} />
                {stop.name}
              </span>
              {stop.note && <span className="mt-0.5 block text-[13px] text-ink-soft">{stop.note}</span>}
              <span className="mt-0.5 block text-[12px] text-ink-soft">停留 {stop.stay_min} 分</span>
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                data-grip
                aria-label={`拖曳「${stop.name}」調整順序，也可用上下鍵`}
                title="拖曳調整順序"
                disabled={day.stops.length === 1}
                onPointerDown={(e) => onPointerDown(e, si)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => onKeyDown(e, si)}
                className={`grid size-9 touch-none place-items-center rounded-xl border-0 bg-field text-ink-soft transition-colors hover:bg-sage hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-field disabled:hover:text-ink-soft ${
                  dragging ? 'cursor-grabbing bg-sage text-white' : 'cursor-grab'
                }`}
              >
                <Icon name="grip" size={16} />
              </button>
              <IconButton
                icon="close"
                label={`刪除「${stop.name}」`}
                disabled={day.stops.length === 1}
                onClick={() => onChange({ ...day, stops: day.stops.filter((_, j) => j !== si) })}
              />
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function IconButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: IconName
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-xl border-0 bg-field text-ink-soft transition-colors hover:bg-sage hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-field disabled:hover:text-ink-soft"
    >
      <Icon name={icon} size={16} />
    </button>
  )
}
