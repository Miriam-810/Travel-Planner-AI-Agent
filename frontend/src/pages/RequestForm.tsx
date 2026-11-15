import { useState, type FormEvent } from 'react'
import { ApiError, checkInvite } from '../api'
import { ErrorBox, Field, GhostButton, PrimaryButton, Section, inputCls } from '../components/Form'
import type { FormDraft } from '../lib/formDraft'
import type { LodgingInput, TripRequest } from '../types'

// Mirrors the backend limits in app/models.py.
const MIN_DAYS = 5
const MAX_DAYS = 8
const MAX_PREFERENCES = 10
const MAX_LODGINGS = 10
const MAX_BUDGET = 1_000_000

const PRESET_PREFERENCES = ['美食', '溫泉', '購物', '自然景觀', '歷史文化', '美術館', '咖啡廳', '親子', '不想太趕']

type Errors = Partial<Record<keyof FormDraft | 'invite', string>>

function tripDays(start: string, end: string): number | null {
  if (!start || !end) return null
  const ms = Date.parse(end) - Date.parse(start)
  return Number.isNaN(ms) ? null : Math.round(ms / 86_400_000) + 1
}

function validate(d: FormDraft, invite: string): Errors {
  const e: Errors = {}
  if (!d.destination.trim()) e.destination = '請填目的地'
  else if (d.destination.trim().length > 50) e.destination = '最多 50 字'

  const days = tripDays(d.start_date, d.end_date)
  if (!d.start_date || !d.end_date) e.end_date = '請選出發和回程日期'
  else if (days === null || days < 1) e.end_date = '回程日期不能早於出發日期'
  else if (days < MIN_DAYS || days > MAX_DAYS) e.end_date = `目前支援 ${MIN_DAYS}–${MAX_DAYS} 天的行程（現在是 ${days} 天）`

  const travelers = Number(d.travelers)
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 20) e.travelers = '1–20 人'

  if (d.budget_twd) {
    const budget = Number(d.budget_twd)
    if (!Number.isInteger(budget) || budget < 0 || budget > MAX_BUDGET) e.budget_twd = '0–1,000,000 的整數'
  }

  const badLodging = d.lodgings.find(
    (l) => !l.name.trim() || l.name.length > 100 || !l.check_in || !l.check_out || l.check_out <= l.check_in,
  )
  if (badLodging) e.lodgings = '每筆住宿都要有名稱（100 字內），退房日要晚於入住日'

  if (!invite.trim()) e.invite = '請填邀請碼'
  return e
}

function toRequest(d: FormDraft): TripRequest {
  return {
    country: 'JP',
    destination: d.destination.trim(),
    start_date: d.start_date,
    end_date: d.end_date,
    arrival_time: d.arrival_time || null,
    departure_time: d.departure_time || null,
    travelers: Number(d.travelers),
    budget_twd: d.budget_twd ? Number(d.budget_twd) : null,
    preferences: d.preferences,
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
}

export function RequestForm({ draft, onDraftChange, inviteCode, onInviteChange, error, onSubmit, onShowSample }: Props) {
  const [errors, setErrors] = useState<Errors>({})
  const [customPref, setCustomPref] = useState('')
  const [quota, setQuota] = useState<string | null>(null)

  const set = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => onDraftChange({ ...draft, [key]: value })

  const togglePref = (p: string) =>
    set('preferences', draft.preferences.includes(p) ? draft.preferences.filter((x) => x !== p) : [...draft.preferences, p])

  const addCustomPref = () => {
    const p = customPref.trim().slice(0, 50)
    if (p && !draft.preferences.includes(p) && draft.preferences.length < MAX_PREFERENCES) {
      set('preferences', [...draft.preferences, p])
    }
    setCustomPref('')
  }

  const setLodging = (i: number, patch: Partial<LodgingInput>) =>
    set('lodgings', draft.lodgings.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const addLodging = () =>
    set('lodgings', [...draft.lodgings, { name: '', check_in: draft.start_date, check_out: draft.end_date }])

  const lookUpQuota = async () => {
    const code = inviteCode.trim()
    if (!code) return setQuota(null)
    try {
      const { remaining_today } = await checkInvite(code)
      setQuota(remaining_today > 0 ? `今天還能產生 ${remaining_today} 份行程` : '這個邀請碼今天的額度用完了')
      setErrors((e) => ({ ...e, invite: undefined }))
    } catch (err) {
      setQuota(null)
      setErrors((e) => ({ ...e, invite: err instanceof ApiError ? err.message : '無法確認邀請碼' }))
    }
  }

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    const found = validate(draft, inviteCode)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      document.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    onSubmit(toRequest(draft))
  }

  const days = tripDays(draft.start_date, draft.end_date)

  return (
    <div className="mx-auto max-w-[640px] px-4 pt-8 pb-20 sm:px-6">
      <header className="mb-6 px-1">
        <div className="font-mono text-[11px] font-bold tracking-[.14em] text-coral uppercase">Plan a Trip</div>
        <h1 className="m-0 text-[26px] leading-tight font-black tracking-[.02em] sm:text-[30px]">規劃你的日本自由行</h1>
        <p className="m-0 mt-2 text-[14px] text-ink-soft">
          填好需求，AI 會查天氣、找景點和餐廳、確認營業時間，排出每天的行程。大約需要 1–3 分鐘。
        </p>
        <button
          type="button"
          onClick={onShowSample}
          className="mt-3 border-0 bg-transparent p-0 text-[14px] font-bold text-coral-deep underline decoration-coral/40 underline-offset-4 hover:decoration-coral"
        >
          先看範例行程（青森・函館 8 天）→
        </button>
      </header>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Section kicker="Where & When" title="目的地和日期">
          <Field
            label="目的地"
            htmlFor="destination"
            hint="目前只支援日本，例如：青森・函館、京都、北海道道東"
            error={errors.destination}
          >
            <input
              id="destination"
              data-invalid={!!errors.destination}
              className={inputCls}
              value={draft.destination}
              maxLength={50}
              placeholder="青森・函館"
              onChange={(e) => set('destination', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="出發日" htmlFor="start">
              <input
                id="start"
                type="date"
                className={inputCls}
                value={draft.start_date}
                onChange={(e) => set('start_date', e.target.value)}
              />
            </Field>
            <Field label="回程日" htmlFor="end">
              <input
                id="end"
                type="date"
                data-invalid={!!errors.end_date}
                className={inputCls}
                value={draft.end_date}
                min={draft.start_date || undefined}
                onChange={(e) => set('end_date', e.target.value)}
              />
            </Field>
          </div>
          {errors.end_date ? (
            <p className="-mt-2 m-0 text-[12.5px] font-bold text-coral-deep">{errors.end_date}</p>
          ) : (
            <p className="-mt-2 m-0 text-[12.5px] text-ink-soft">
              {days && days > 0 ? `共 ${days} 天・` : ''}支援 {MIN_DAYS}–{MAX_DAYS} 天
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="去程班機抵達" htmlFor="arrival" hint="選填，用來安排第一天">
              <input
                id="arrival"
                type="time"
                className={inputCls}
                value={draft.arrival_time}
                onChange={(e) => set('arrival_time', e.target.value)}
              />
            </Field>
            <Field label="回程班機起飛" htmlFor="departure" hint="選填，用來安排最後一天">
              <input
                id="departure"
                type="time"
                className={inputCls}
                value={draft.departure_time}
                onChange={(e) => set('departure_time', e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section kicker="Who & How" title="人數、預算和偏好">
          <div className="grid grid-cols-2 gap-3">
            <Field label="人數" htmlFor="travelers" error={errors.travelers}>
              <input
                id="travelers"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                data-invalid={!!errors.travelers}
                className={inputCls}
                value={draft.travelers}
                onChange={(e) => set('travelers', e.target.value)}
              />
            </Field>
            <Field label="預算（台幣，選填）" htmlFor="budget" error={errors.budget_twd}>
              <input
                id="budget"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_BUDGET}
                step={1000}
                data-invalid={!!errors.budget_twd}
                className={inputCls}
                value={draft.budget_twd}
                placeholder="60000"
                onChange={(e) => set('budget_twd', e.target.value)}
              />
            </Field>
          </div>

          <Field label="偏好" hint={`點選或自己輸入，最多 ${MAX_PREFERENCES} 項`}>
            <div className="flex flex-wrap gap-2">
              {[...PRESET_PREFERENCES, ...draft.preferences.filter((p) => !PRESET_PREFERENCES.includes(p))].map((p) => {
                const on = draft.preferences.includes(p)
                const full = !on && draft.preferences.length >= MAX_PREFERENCES
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    disabled={full}
                    onClick={() => togglePref(p)}
                    className={`rounded-full border px-3 py-1 text-[14px] transition-colors disabled:opacity-40 ${
                      on
                        ? 'border-coral bg-coral font-bold text-white'
                        : 'border-line bg-white text-ink hover:border-coral'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
            <div className="mt-1 flex gap-2">
              <input
                aria-label="自訂偏好"
                className={inputCls}
                value={customPref}
                maxLength={50}
                placeholder="例如：想看雪景、不吃生食"
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
          </Field>
        </Section>

        <Section kicker="Stay" title="已訂的住宿（選填）">
          <p className="-mt-2 m-0 text-[13px] text-ink-soft">填了之後，AI 會讓每天的行程在住宿附近結束。</p>
          {draft.lodgings.map((l, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-3">
              <div className="flex gap-2">
                <input
                  aria-label={`住宿 ${i + 1} 名稱`}
                  className={inputCls}
                  value={l.name}
                  maxLength={100}
                  placeholder="飯店名稱"
                  onChange={(e) => setLodging(i, { name: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`刪除住宿 ${i + 1}`}
                  onClick={() => set('lodgings', draft.lodgings.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-xl border border-line bg-white px-3 text-ink-soft hover:border-coral hover:text-coral-deep"
                >
                  ✕
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
          {errors.lodgings && (
            <p data-invalid="true" className="m-0 text-[12.5px] font-bold text-coral-deep">
              {errors.lodgings}
            </p>
          )}
          {draft.lodgings.length < MAX_LODGINGS && (
            <div>
              <GhostButton onClick={addLodging}>＋ 新增住宿</GhostButton>
            </div>
          )}
        </Section>

        <Section kicker="Invite" title="邀請碼">
          <Field
            label="邀請碼"
            htmlFor="invite"
            hint={quota ?? '產生行程需要邀請碼，請向網站作者索取。這台裝置會記住它。'}
            error={errors.invite}
          >
            <input
              id="invite"
              data-invalid={!!errors.invite}
              className={`${inputCls} font-mono`}
              value={inviteCode}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => onInviteChange(e.target.value)}
              onBlur={lookUpQuota}
            />
          </Field>
        </Section>

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="flex flex-col items-center gap-2 pt-2">
          <PrimaryButton type="submit">開始規劃</PrimaryButton>
          <p className="m-0 text-center text-[12.5px] text-ink-soft">每個邀請碼每天可以產生 3 份行程</p>
        </div>
      </form>
    </div>
  )
}
