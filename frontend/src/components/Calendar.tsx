// Date pickers in the app's own style (the browser's built-in picker can't be
// styled, and moves months up and down). Dates are "YYYY-MM-DD" strings, which
// compare correctly as text.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { addDays, isoOf, longDate, todayIso, WEEKDAYS } from '../lib/dates'
import { Icon } from './Icon'

interface CalendarProps {
  /** The month to show first, "YYYY-MM-DD" of any day in it. */
  initial: string
  /** Which date has keyboard focus first. */
  focusDate?: string
  dayState: (iso: string) => { disabled?: boolean; selected?: boolean; inRange?: boolean; edge?: 'start' | 'end' }
  onPick: (iso: string) => void
  onHover?: (iso: string | null) => void
  /** Called when Escape is pressed inside the calendar. */
  onEscape?: () => void
  label: string
}

/** One month at a time, moved with the ‹ › arrows (or PageUp / PageDown). */
export function Calendar({ initial, focusDate, dayState, onPick, onHover, onEscape, label }: CalendarProps) {
  const [y0, m0] = initial.split('-').map(Number)
  const [month, setMonth] = useState({ y: y0, m: m0 - 1 })
  const [focus, setFocus] = useState(focusDate ?? initial)
  const grid = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const first = new Date(month.y, month.m, 1)
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoOf(month.y, month.m, i + 1)),
  ]
  while (cells.length % 7) cells.push(null)

  const shift = (by: number) => {
    const d = new Date(month.y, month.m + by, 1)
    setMonth({ y: d.getFullYear(), m: d.getMonth() })
  }

  // Keep the focused day inside the month on screen.
  const moveFocus = (iso: string) => {
    setFocus(iso)
    const [y, m] = iso.split('-').map(Number)
    if (y !== month.y || m - 1 !== month.m) setMonth({ y, m: m - 1 })
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${iso}"]`)?.focus())
  }

  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in step) {
      e.preventDefault()
      moveFocus(addDays(focus, step[e.key]))
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const [y, m, d] = focus.split('-').map(Number)
      moveFocus(isoOf(y, m - 1 + (e.key === 'PageUp' ? -1 : 1), Math.min(d, 28)))
    } else if (e.key === 'Escape' && onEscape) {
      e.preventDefault()
      onEscape()
    }
  }

  const focusInMonth = cells.includes(focus) ? focus : cells.find((c) => c && !dayState(c).disabled) ?? null

  return (
    <div className="select-none" onMouseLeave={() => onHover?.(null)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="上個月"
          onClick={() => shift(-1)}
          className="grid size-9 place-items-center rounded-xl border-0 bg-field text-ink-soft hover:bg-sage hover:text-white"
        >
          <Icon name="back" size={16} />
        </button>
        <p id={titleId} className="m-0 font-[family-name:var(--font-round)] text-[16px] text-ink tabular-nums" aria-live="polite">
          {month.y} 年 {month.m + 1} 月
        </p>
        <button
          type="button"
          aria-label="下個月"
          onClick={() => shift(1)}
          className="grid size-9 place-items-center rounded-xl border-0 bg-field text-ink-soft hover:bg-sage hover:text-white"
        >
          <Icon name="forward" size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[12px] text-ink-soft" aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={`py-1 ${i === 0 ? 'text-apricot-deep' : ''}`}>
            {w}
          </span>
        ))}
      </div>

      <div ref={grid} role="grid" aria-label={label} aria-labelledby={titleId} className="grid grid-cols-7 gap-y-1" onKeyDown={onKey}>
        {cells.map((iso, i) => {
          if (!iso) return <span key={`blank-${i}`} />
          const st = dayState(iso)
          const day = Number(iso.slice(8))
          const today = iso === todayIso()
          const band = st.inRange || st.edge
          return (
            <div
              key={iso}
              className={`flex h-10 items-center justify-center ${band ? 'bg-sage-soft' : ''} ${
                st.edge === 'start' ? 'rounded-l-full' : ''
              } ${st.edge === 'end' ? 'rounded-r-full' : ''} ${i % 7 === 0 && band ? 'rounded-l-full' : ''} ${
                i % 7 === 6 && band ? 'rounded-r-full' : ''
              }`}
            >
              <button
                type="button"
                data-day={iso}
                tabIndex={iso === focusInMonth ? 0 : -1}
                disabled={st.disabled}
                aria-pressed={!!st.selected}
                aria-label={longDate(iso)}
                onClick={() => {
                  setFocus(iso)
                  onPick(iso)
                }}
                onMouseEnter={() => onHover?.(iso)}
                onFocus={() => onHover?.(iso)}
                className={`grid size-10 place-items-center rounded-full border-0 text-[15px] tabular-nums transition-colors ${
                  st.selected
                    ? 'bg-sage text-white'
                    : st.disabled
                      ? 'cursor-default bg-transparent text-ink-soft/35'
                      : 'bg-transparent text-ink hover:bg-sage/20'
                } ${today && !st.selected ? 'ring-1 ring-sage ring-inset' : ''}`}
              >
                {day}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Trip dates: tap the first day, then the last; the days between are shaded. */
export function RangeCalendar({
  start,
  end,
  maxDays,
  onChange,
}: {
  start: string
  end: string
  maxDays: number
  onChange: (start: string, end: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const today = todayIso()
  const picking = Boolean(start) && !end // waiting for the last day

  const previewEnd = picking && hover && hover >= start && hover <= addDays(start, maxDays - 1) ? hover : end
  const dayState = (iso: string) => {
    const disabled = iso < today || (picking && iso > addDays(start, maxDays - 1))
    const edge = iso === start ? 'start' : iso === previewEnd ? 'end' : undefined
    return {
      disabled,
      selected: iso === start || iso === end,
      inRange: Boolean(start && previewEnd && iso > start && iso < previewEnd),
      edge: start && previewEnd && start !== previewEnd ? edge : undefined,
    } as const
  }

  const pick = (iso: string) => {
    if (!picking || iso < start) onChange(iso, '')
    else onChange(start, iso)
  }

  return (
    <div className="rounded-3xl bg-field/60 p-3">
      <Calendar
        initial={start || today}
        focusDate={start || today}
        dayState={dayState}
        onPick={pick}
        onHover={setHover}
        label="選擇出發和回程日期"
      />
      <p className="m-0 mt-2 text-center text-[13px] text-ink-soft">
        {picking ? `再選回程日（最多 ${maxDays} 天）` : start && end ? '想改的話，重新點出發日' : '先點出發日'}
      </p>
    </div>
  )
}

/** A date field that opens a calendar below it (hotel check-in and check-out). */
export function DateField({
  value,
  onChange,
  min,
  max,
  label,
  placeholder = '選擇日期',
  alignRight = false,
}: {
  value: string
  onChange: (iso: string) => void
  min?: string
  max?: string
  label: string
  placeholder?: string
  /** Open the calendar from the right edge (for a field on the right of a row). */
  alignRight?: boolean
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    requestAnimationFrame(() => box.current?.querySelector<HTMLButtonElement>('[role=grid] button[tabindex="0"]')?.focus())
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={`${label}：${value ? longDate(value) : '未選'}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex h-12 w-full items-center gap-2 rounded-2xl border border-transparent bg-field px-3 text-left text-[15px] tabular-nums outline-none focus-visible:border-sage ${
          value ? 'text-ink' : 'text-ink-soft'
        }`}
      >
        <Icon name="calendar" size={18} />
        <span className="truncate">{value ? longDate(value).slice(5) : placeholder}</span>
      </button>
      {open && (
        <div className={`absolute top-[calc(100%+6px)] ${alignRight ? 'right-0' : 'left-0'} z-30 w-[300px] max-w-[calc(100vw-48px)] rounded-3xl bg-cream p-3 shadow-[var(--shadow-card)]`}>
          <Calendar
            initial={value || min || todayIso()}
            focusDate={value || min}
            dayState={(iso) => ({ disabled: Boolean((min && iso < min) || (max && iso > max)), selected: iso === value })}
            onPick={(iso) => {
              onChange(iso)
              close()
            }}
            onEscape={close}
            label={label}
          />
        </div>
      )}
    </div>
  )
}
