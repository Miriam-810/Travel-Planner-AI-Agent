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

            <ol className="m-0 flex list-none flex-col p-0">
              {day.stops.map((stop, si) => (
                <li
                  key={`${stop.place_id}-${si}`}
                  className="grid grid-cols-[48px_1fr_auto] items-start gap-2 border-t border-line/70 py-3 first:border-t-0"
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
                    <IconButton
                      icon="up"
                      label={`把「${stop.name}」往前移`}
                      disabled={si === 0}
                      onClick={() => updateDay(di, moveStop(day, si, si - 1))}
                    />
                    <IconButton
                      icon="down"
                      label={`把「${stop.name}」往後移`}
                      disabled={si === day.stops.length - 1}
                      onClick={() => updateDay(di, moveStop(day, si, si + 1))}
                    />
                    <IconButton
                      icon="close"
                      label={`刪除「${stop.name}」`}
                      disabled={day.stops.length === 1}
                      onClick={() => updateDay(di, { ...day, stops: day.stops.filter((_, j) => j !== si) })}
                    />
                  </span>
                </li>
              ))}
            </ol>
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
            <p className="m-0 text-[12.5px] text-ink-soft">調整順序時時間不變，地點互換時段；營業時間會在下一步重新檢查。</p>
          )}
        </div>
      </div>
    </div>
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
