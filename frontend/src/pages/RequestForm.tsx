import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, checkInvite } from '../api'
import {
  Card,
  ErrorBox,
  Field,
  GhostButton,
  IconInput,
  NextButton,
  PrimaryButton,
  StepDashes,
  TextButton,
  inputCls,
} from '../components/Form'
import { Icon } from '../components/Icon'
import { IslandMark } from '../components/IslandMark'
import type { FormDraft, Pace } from '../lib/formDraft'
import { monthDay } from '../lib/format'
import type { LodgingInput, TripRequest } from '../types'

// Mirrors the backend limits in app/models.py.
const MIN_DAYS = 1
const MAX_DAYS = 10
const MAX_PREFERENCES = 10
const MAX_LODGINGS = 10
const MAX_BUDGET = 1_000_000

const INTERESTS = ['美食', '溫泉', '購物', '自然景觀', '歷史文化', '美術館', '咖啡廳', '親子', '雪景']
const PACES: { value: Exclude<Pace, ''>; hint: string }[] = [
  { value: '悠閒', hint: '每站待久一點，下午有空檔喝咖啡' },
  { value: '適中', hint: '一天三、四個點，吃飯不趕' },
  { value: '緊湊', hint: '想多看幾個地方' },
]

function tripDays(start: string, end: string): number | null {
  if (!start || !end) return null
  const ms = Date.parse(end) - Date.parse(start)
  return Number.isNaN(ms) ? null : Math.round(ms / 86_400_000) + 1
}

function toRequest(d: FormDraft): TripRequest {
  const pace = d.pace ? [`行程節奏：${d.pace}`] : []
  return {
    country: 'JP',
    destination: d.destination.trim(),
    start_date: d.start_date,
    end_date: d.end_date,
    arrival_time: d.arrival_time || null,
    departure_time: d.departure_time || null,
    travelers: Number(d.travelers),
    budget_twd: d.budget_twd ? Number(d.budget_twd) : null,
    preferences: [...pace, ...d.preferences].slice(0, MAX_PREFERENCES),
    lodgings: d.lodgings.map((l) => ({ ...l, name: l.name.trim() })),
  }
}

interface Props {
  draft: FormDraft
  onDraftChange: (d: FormDraft) => void
  inviteCode: string
  onInviteChange: (code: string) => void
  error: string | null
  onSubmit: (request: TripRequest) => void
  onShowSample: () => void
  /** Set when a previous outline or trip is saved, to go back to it. */
  onResume?: { label: string; go: () => void }
  /** The globe of planned trips, shown above the questions. */
  globe?: ReactNode
}

interface Step {
  title: string
  subtitle?: string
  optional?: boolean
  /** A message when the answer can't be accepted yet. */
  check: () => string | null
  body: ReactNode
}

export function RequestForm({ draft, onDraftChange, inviteCode, onInviteChange, error, onSubmit, onShowSample, onResume, globe }: Props) {
  const [customPref, setCustomPref] = useState('')
  const [quota, setQuota] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)

  const set = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => onDraftChange({ ...draft, [key]: value })
  const days = tripDays(draft.start_date, draft.end_date)
  const maxInterests = MAX_PREFERENCES - (draft.pace ? 1 : 0)

  const toggleInterest = (p: string) =>
    set('preferences', draft.preferences.includes(p) ? draft.preferences.filter((x) => x !== p) : [...draft.preferences, p])

  const addCustomPref = () => {
    const p = customPref.trim().slice(0, 50)
    if (p && !draft.preferences.includes(p) && draft.preferences.length < maxInterests) {
      set('preferences', [...draft.preferences, p])
    }
    setCustomPref('')
  }

  const setLodging = (i: number, patch: Partial<LodgingInput>) =>
    set('lodgings', draft.lodgings.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const lookUpQuota = async () => {
    const code = inviteCode.trim()
    if (!code) return setQuota(null)
    try {
      const { remaining_today } = await checkInvite(code)
      setQuota(remaining_today > 0 ? `今天還能產生 ${remaining_today} 份行程` : '這個邀請碼今天的額度用完了')
      setInviteError(null)
    } catch (err) {
      setQuota(null)
      setInviteError(err instanceof ApiError ? err.message : '無法確認邀請碼')
    }
  }

  const steps: Step[] = [
    {
      title: '這次想去日本哪裡？',
      subtitle: '城市、地區都可以，例如：青森・函館、京都、北海道道東',
      check: () => {
        const d = draft.destination.trim()
        if (!d) return '請填目的地'
        return d.length > 50 ? '最多 50 個字' : null
      },
      body: (
        <IconInput
          icon="pin"
          aria-label="目的地"
          autoFocus
          value={draft.destination}
          maxLength={50}
          placeholder="青森・函館"
          onChange={(e) => set('destination', e.target.value)}
        />
      ),
    },
    {
      title: '什麼時候出發？',
      subtitle: `最多可以排 ${MAX_DAYS} 天`,
      check: () => {
        if (!draft.start_date || !draft.end_date) return '請選出發和回程日期'
        if (days === null || days < 1) return '回程日期不能早於出發日期'
        if (days < MIN_DAYS || days > MAX_DAYS) return `目前最多 ${MAX_DAYS} 天（現在是 ${days} 天）`
        return null
      },
      body: (
        <div className="flex flex-col gap-3">
          <Field label="出發日" htmlFor="start">
            <IconInput
              icon="calendar"
              id="start"
              type="date"
              value={draft.start_date}
              onChange={(e) => set('start_date', e.target.value)}
            />
          </Field>
          <Field label="回程日" htmlFor="end">
            <IconInput
              icon="calendar"
              id="end"
              type="date"
              value={draft.end_date}
              min={draft.start_date || undefined}
              onChange={(e) => set('end_date', e.target.value)}
            />
          </Field>
          {days !== null && days > 0 && (
            <p className="m-0 rounded-2xl bg-sage-soft px-4 py-2 text-[14px] text-sage-deep">
              {monthDay(draft.start_date)} 出發，共 {days} 天
            </p>
          )}
        </div>
      ),
    },
    {
      title: '班機幾點抵達、幾點回程？',
      subtitle: '知道的話，第一天和最後一天會排得剛剛好',
      optional: true,
      check: () =>
        days === 1 && draft.arrival_time && draft.departure_time && draft.arrival_time >= draft.departure_time
          ? '一日遊的話，抵達時間要早於回程起飛時間'
          : null,
      body: (
        <div className="flex flex-col gap-3">
          <Field label="去程班機抵達日本" htmlFor="arrival">
            <IconInput
              icon="plane"
              id="arrival"
              type="time"
              value={draft.arrival_time}
              onChange={(e) => set('arrival_time', e.target.value)}
            />
          </Field>
          <Field label="回程班機起飛" htmlFor="departure">
            <IconInput
              icon="plane"
              id="departure"
              type="time"
              value={draft.departure_time}
              onChange={(e) => set('departure_time', e.target.value)}
            />
          </Field>
        </div>
      ),
    },
    {
      title: '幾個人去？預算大概多少？',
      check: () => {
        const n = Number(draft.travelers)
        if (!Number.isInteger(n) || n < 1 || n > 20) return '人數請填 1–20'
        if (draft.budget_twd) {
          const b = Number(draft.budget_twd)
          if (!Number.isInteger(b) || b < 0 || b > MAX_BUDGET) return '預算請填 0–1,000,000 的整數'
        }
        return null
      },
      body: (
        <div className="flex flex-col gap-4">
          <Field label="人數">
            <div className="flex items-center gap-3">
              <Stepper
                label="減少一人"
                disabled={Number(draft.travelers) <= 1}
                onClick={() => set('travelers', String(Math.max(1, Number(draft.travelers) - 1)))}
              >
                −
              </Stepper>
              <span className="min-w-[4ch] text-center text-[22px] font-bold tabular-nums">{draft.travelers}</span>
              <Stepper
                label="增加一人"
                disabled={Number(draft.travelers) >= 20}
                onClick={() => set('travelers', String(Math.min(20, Number(draft.travelers) + 1)))}
              >
                +
              </Stepper>
              <span className="text-ink-soft">人</span>
            </div>
          </Field>
          <Field label="總預算（台幣，選填）" htmlFor="budget">
            <IconInput
              icon="wallet"
              id="budget"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_BUDGET}
              step={1000}
              value={draft.budget_twd}
              placeholder="60000"
              onChange={(e) => set('budget_twd', e.target.value)}
            />
          </Field>
        </div>
      ),
    },
    {
      title: '你喜歡怎麼玩？',
      subtitle: '節奏選一個，興趣可以多選',
      optional: true,
      check: () => null,
      body: (
        <div className="flex flex-col gap-5">
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-[12px] tracking-[.12em] text-ink-soft">行程節奏・選一個</legend>
            {PACES.map((p) => (
              <label key={p.value} className="flex cursor-pointer items-start gap-3 rounded-2xl px-2 py-2 hover:bg-sage-soft/60">
                <input
                  type="radio"
                  name="pace"
                  className="peer sr-only"
                  checked={draft.pace === p.value}
                  onChange={() => set('pace', p.value)}
                />
                <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink-soft peer-checked:border-sage peer-focus-visible:outline-2 peer-focus-visible:outline-sage">
                  <span className={`size-2.5 rounded-full ${draft.pace === p.value ? 'bg-sage' : 'bg-transparent'}`} />
                </span>
                <span>
                  <span className="block text-[16px]">{p.value}</span>
                  <span className="block text-[13px] text-ink-soft">{p.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-2">
            <div className="text-[12px] tracking-[.12em] text-ink-soft">興趣・可複選</div>
            <div className="flex flex-wrap gap-2">
              {[...INTERESTS, ...draft.preferences.filter((p) => !INTERESTS.includes(p))].map((p) => {
                const on = draft.preferences.includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    disabled={!on && draft.preferences.length >= maxInterests}
                    onClick={() => toggleInterest(p)}
                    className={`rounded-full border-0 px-4 py-1.5 text-[14px] transition-colors disabled:opacity-40 ${
                      on ? 'bg-sage text-white' : 'bg-field text-ink hover:bg-mist-deep'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <input
                aria-label="自己輸入興趣"
                className={inputCls}
                value={customPref}
                maxLength={50}
                placeholder="其他想法，例如：不吃生食"
                onChange={(e) => setCustomPref(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomPref()
                  }
                }}
              />
              <GhostButton onClick={addCustomPref}>加入</GhostButton>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '已經訂好住宿了嗎？',
      subtitle: '填了之後，每天的行程會在住宿附近結束',
      optional: true,
      check: () =>
        draft.lodgings.some(
          (l) => !l.name.trim() || l.name.length > 100 || !l.check_in || !l.check_out || l.check_out <= l.check_in,
        )
          ? '每筆住宿都要有名稱，退房日要晚於入住日'
          : null,
      body: (
        <div className="flex flex-col gap-3">
          {draft.lodgings.map((l, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-3xl bg-sage-soft/70 p-3">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <IconInput
                    icon="bed"
                    aria-label={`住宿 ${i + 1} 名稱`}
                    value={l.name}
                    maxLength={100}
                    placeholder="飯店名稱"
                    onChange={(e) => setLodging(i, { name: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`刪除住宿 ${i + 1}`}
                  onClick={() => set('lodgings', draft.lodgings.filter((_, j) => j !== i))}
                  className="grid size-11 shrink-0 place-items-center rounded-2xl border-0 bg-field text-ink-soft hover:text-apricot-deep"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-soft">
                  入住
                  <input
                    type="date"
                    className={inputCls}
                    value={l.check_in}
                    onChange={(e) => setLodging(i, { check_in: e.target.value })}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-soft">
                  退房
                  <input
                    type="date"
                    className={inputCls}
                    value={l.check_out}
                    onChange={(e) => setLodging(i, { check_out: e.target.value })}
                  />
                </label>
              </div>
            </div>
          ))}
          {draft.lodgings.length < MAX_LODGINGS && (
            <div>
              <GhostButton
                onClick={() =>
                  set('lodgings', [...draft.lodgings, { name: '', check_in: draft.start_date, check_out: draft.end_date }])
                }
              >
                ＋ 新增住宿
              </GhostButton>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '最後，輸入邀請碼',
      subtitle: '產生行程需要邀請碼，請向網站作者索取。這台裝置會記住它。',
      check: () => (inviteCode.trim() ? null : '請填邀請碼'),
      body: (
        <div className="flex flex-col gap-4">
          <Field label="邀請碼" htmlFor="invite" hint={quota} error={inviteError}>
            <IconInput
              icon="key"
              id="invite"
              value={inviteCode}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => onInviteChange(e.target.value)}
              onBlur={lookUpQuota}
            />
          </Field>
          <Summary draft={draft} days={days} />
        </div>
      ),
    },
  ]

  const last = steps.length - 1
  // Coming back with an error from the server: open on the last step, where the error shows.
  const [step, setStep] = useState(error ? last : 0)
  const current = steps[step]

  const next = (ev?: FormEvent) => {
    ev?.preventDefault()
    const problem = current.check()
    setStepError(problem)
    if (problem) return
    if (step < last) setStep(step + 1)
    else onSubmit(toRequest(draft))
  }

  const back = () => {
    setStepError(null)
    setStep(Math.max(0, step - 1))
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-4 pt-8 pb-16 sm:pt-14">
      <header className="mb-6 flex flex-col items-center text-center">
        <IslandMark />
        <h1 className="m-0 mt-2 text-[26px] leading-tight text-ink">旅程小島</h1>
        <p className="m-0 mt-1 text-[15px] text-ink-soft">一起規劃行程吧</p>
      </header>

      {globe}

      <form onSubmit={next} noValidate className="relative">
        {/* A second sheet peeking out behind the card. */}
        <div aria-hidden className="absolute inset-x-3 -top-2 bottom-3 -rotate-2 rounded-[28px] bg-cream/60" />
        <Card className="relative p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <StepDashes current={step} total={steps.length} />
            <span className="text-[13px] text-ink-soft tabular-nums">
              {step + 1} / {steps.length}
            </span>
          </div>

          <div className="mt-5 text-[12px] tracking-[.12em] text-ink-soft">
            第 {step + 1} 題{current.optional ? '・可以跳過' : ''}
          </div>
          <h2 className="m-0 mt-1 text-[22px] leading-snug sm:text-[24px]">{current.title}</h2>
          {current.subtitle && <p className="m-0 mt-1 text-[14px] text-ink-soft">{current.subtitle}</p>}

          <div className="mt-5">{current.body}</div>

          {stepError && <p className="m-0 mt-3 text-[14px] text-apricot-deep">{stepError}</p>}
          {step === last && error && (
            <div className="mt-4">
              <ErrorBox>{error}</ErrorBox>
            </div>
          )}

          <div className="mt-7 flex items-center justify-end gap-2">
            {step > 0 && <TextButton onClick={back}>上一步</TextButton>}
            {step < last ? (
              <NextButton type="submit">{current.optional && isEmptyStep(step, draft) ? '跳過' : '下一步'}</NextButton>
            ) : (
              <PrimaryButton type="submit">開始規劃</PrimaryButton>
            )}
          </div>
        </Card>
      </form>

      {onResume && (
        <button
          type="button"
          onClick={onResume.go}
          className="mx-auto mt-6 rounded-full border-0 bg-cream px-5 py-2 text-[15px] text-ink shadow-[var(--shadow-soft)] hover:text-sage-deep"
        >
          {onResume.label} →
        </button>
      )}

      <button
        type="button"
        onClick={onShowSample}
        className="mx-auto mt-8 flex items-center gap-1.5 border-0 bg-transparent text-[15px] text-sage-deep underline decoration-sage/40 underline-offset-4 hover:decoration-sage"
      >
        <Icon name="map" size={18} />
        先看範例行程：青森・函館 8 天
      </button>
    </div>
  )
}

function isEmptyStep(step: number, d: FormDraft): boolean {
  if (step === 2) return !d.arrival_time && !d.departure_time
  if (step === 4) return !d.pace && d.preferences.length === 0
  if (step === 5) return d.lodgings.length === 0
  return false
}

function Stepper({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-2xl border-0 bg-field text-[22px] text-ink hover:bg-mist-deep disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Summary({ draft, days }: { draft: FormDraft; days: number | null }) {
  const rows: [string, string][] = [
    ['目的地', draft.destination || '—'],
    ['日期', draft.start_date && draft.end_date ? `${monthDay(draft.start_date)}–${monthDay(draft.end_date)}・${days} 天` : '—'],
    ['班機', [draft.arrival_time && `${draft.arrival_time} 抵達`, draft.departure_time && `${draft.departure_time} 起飛`].filter(Boolean).join('，') || '未填'],
    ['人數', `${draft.travelers} 人${draft.budget_twd ? `・預算 ${Number(draft.budget_twd).toLocaleString()} 元` : ''}`],
    ['喜好', [draft.pace, ...draft.preferences].filter(Boolean).join('、') || '未填'],
    ['住宿', draft.lodgings.length ? draft.lodgings.map((l) => l.name).join('、') : '未填'],
  ]
  return (
    <dl className="m-0 grid grid-cols-[4.5em_1fr] gap-x-3 gap-y-1.5 rounded-3xl bg-sage-soft/70 px-4 py-3 text-[14px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-soft">{k}</dt>
          <dd className="m-0 min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
