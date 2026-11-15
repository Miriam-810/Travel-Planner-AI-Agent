import { KindBadge } from '../components/Badges'
import { ErrorBox, GhostButton, PrimaryButton } from '../components/Form'
import { hhmm, monthDay, weekdayZh, zhNumber } from '../lib/format'
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

/** Move a stop up or down. Time slots stay where they are; the stops trade places in them. */
function moveStop(day: DayDraft, from: number, to: number): DayDraft {
  const stops = [...day.stops]
  const a = stops[from]
  const b = stops[to]
  stops[from] = { ...b, arrive: a.arrive }
  stops[to] = { ...a, arrive: b.arrive }
  return { ...day, stops }
}

export function OutlineReview({ request, outline, edited, warnings, busy, error, onChange, onReset, onConfirm, onBack }: Props) {
  const updateDay = (i: number, day: DayDraft) => onChange({ days: outline.days.map((d, j) => (j === i ? day : d)) })
  const stopCount = outline.days.reduce((n, d) => n + d.stops.length, 0)

  return (
    <div className="mx-auto max-w-[720px] px-4 pt-8 pb-28 sm:px-6">
      <header className="mb-5 px-1">
        <div className="font-mono text-[11px] font-bold tracking-[.14em] text-coral uppercase">Review the Outline</div>
        <h1 className="m-0 text-[24px] leading-tight font-black tracking-[.02em] sm:text-[28px]">{request.destination}</h1>
        <p className="m-0 mt-1 text-[13px] text-ink-soft">
          {monthDay(request.start_date)}–{monthDay(request.end_date)}・{outline.days.length} 天・{stopCount} 個地點
        </p>
        <p className="m-0 mt-3 text-[14px] text-[#4B433C]">
          這是 AI 排好的大綱。可以調整順序或刪掉不想去的地方，確認後會補上天氣、營業時間和地圖。
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-r-xl border-l-[3px] border-coral bg-paper-2 px-3 py-2.5 text-[13.5px] text-[#4B433C]">
          <p className="m-0 mb-1 font-bold">AI 重排後仍有這些問題，請留意：</p>
          {warnings.map((w) => (
            <p key={w} className="m-0">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {outline.days.map((day, di) => (
          <li key={day.date} className="rounded-2xl border border-line bg-white/70 p-3 sm:p-4">
            <div className="mb-2 grid grid-cols-[40px_1fr_auto] items-center gap-2">
              <span className="font-display text-[24px] leading-none font-bold text-coral italic">{di + 1}</span>
              <span className="min-w-0">
                <span className="block font-mono text-[10.5px] font-bold tracking-[.14em] text-coral">
                  第{zhNumber(di + 1)}天・{day.area}
                </span>
                <span className="block text-[15px] leading-snug font-bold">{day.title}</span>
              </span>
              <span className="text-right font-mono text-[11px] leading-tight text-ink-soft">
                <b className="block text-[12px] text-ink">{monthDay(day.date)}</b>
                {weekdayZh(day.date)}
              </span>
            </div>

            <ol className="m-0 flex list-none flex-col p-0">
              {day.stops.map((stop, si) => (
                <li
                  key={`${stop.place_id}-${si}`}
                  className="grid grid-cols-[46px_1fr_auto] items-start gap-2 border-t border-line/70 py-2.5 first:border-t-0"
                >
                  <span className="pt-0.5 font-mono text-[13px] font-bold tabular-nums">{hhmm(stop.arrive)}</span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] leading-snug font-bold">
                      <KindBadge stop={stop} />
                      {stop.name}
                    </span>
                    {stop.note && <span className="mt-0.5 block text-[13px] text-ink-soft">{stop.note}</span>}
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-soft">停留 {stop.stay_min} 分</span>
                  </span>
                  <span className="flex gap-1">
                    <IconButton
                      label={`把「${stop.name}」往前移`}
                      disabled={si === 0}
                      onClick={() => updateDay(di, moveStop(day, si, si - 1))}
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label={`把「${stop.name}」往後移`}
                      disabled={si === day.stops.length - 1}
                      onClick={() => updateDay(di, moveStop(day, si, si + 1))}
                    >
                      ↓
                    </IconButton>
                    <IconButton
                      label={`刪除「${stop.name}」`}
                      disabled={day.stops.length === 1}
                      onClick={() => updateDay(di, { ...day, stops: day.stops.filter((_, j) => j !== si) })}
                    >
                      ✕
                    </IconButton>
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      {/* Actions stay reachable at the bottom of the screen on long outlines. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[720px] flex-col gap-2">
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <GhostButton onClick={onBack}>← 修改需求</GhostButton>
              {edited && <GhostButton onClick={onReset}>還原</GhostButton>}
            </div>
            <PrimaryButton disabled={busy} onClick={onConfirm}>
              {busy ? '產生中…' : '確認，產生行程'}
            </PrimaryButton>
          </div>
          {edited && (
            <p className="m-0 text-[12px] text-ink-soft">調整順序時時間不變，地點互換時段；營業時間會在下一步重新檢查。</p>
          )}
        </div>
      </div>
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg border border-line bg-white text-[13px] text-ink-soft transition-colors hover:border-coral hover:text-coral-deep disabled:cursor-default disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink-soft"
    >
      {children}
    </button>
  )
}
