import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatTurn } from '../types'
import { Icon } from './Icon'

export interface ReviseChatProps {
  messages: ChatTurn[]
  busy: boolean
  error: string | null
  /** Chat edits left today, once the server has said. */
  left: number | null
  canUndo: boolean
  changed: string[]
  onSend: (text: string) => void
  onCancel: () => void
  onUndo: () => void
}

const MAX = 500
const QUICK = ['輕鬆一點', '多一點美食', '早上不要太早', '換掉下雨天的戶外行程']

/** "Tell the AI what to change": a small chat beside the outline. */
export function ReviseChat({ messages, busy, error, left, canUndo, onSend, onCancel, onUndo }: ReviseChatProps) {
  const [text, setText] = useState('')
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  const send = (value: string) => {
    const v = value.trim()
    if (!v || busy) return
    onSend(v)
    setText('')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(text)
  }

  return (
    <section
      id="revise-chat"
      aria-label="跟 AI 說想怎麼改"
      className="flex flex-col rounded-[28px] bg-cream p-4 shadow-[var(--shadow-soft)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[17px]">想怎麼改？</h2>
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            className="rounded-full border-0 bg-field px-3 py-1 text-[13px] text-ink-soft hover:text-ink disabled:opacity-40"
          >
            還原上一版
          </button>
        )}
      </div>
      <p className="m-0 mt-1 text-[13px] text-ink-soft">
        用一句話告訴 AI，例如「第三天下午想去嵐山」「晚餐想吃燒肉」。只會改你提到的地方。
      </p>

      <div ref={log} className="mt-3 flex max-h-[320px] min-h-[64px] flex-col gap-2 overflow-y-auto" aria-live="polite">
        {messages.map((m, i) => (
          <p
            key={i}
            className={`m-0 max-w-[88%] rounded-2xl px-3 py-2 text-[14px] leading-relaxed ${
              m.role === 'user' ? 'self-end bg-sage text-white' : 'self-start bg-field text-ink'
            }`}
          >
            {m.text}
          </p>
        ))}
        {busy && (
          <p className="m-0 flex items-center gap-2 self-start rounded-2xl bg-field px-3 py-2 text-[14px] text-ink-soft">
            <span className="inline-block size-2 animate-pulse rounded-full bg-sage" />
            AI 正在修改，通常要 30 秒到 1 分鐘…
            <button
              type="button"
              onClick={onCancel}
              className="border-0 bg-transparent p-0 text-[13px] text-sage-deep underline underline-offset-2"
            >
              取消
            </button>
          </p>
        )}
        {error && <p className="m-0 self-start rounded-2xl bg-apricot-soft px-3 py-2 text-[14px] text-apricot-deep">{error}</p>}
      </div>

      {messages.length === 0 && !busy && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className="rounded-full border border-line bg-white px-3 py-1 text-[13px] text-ink hover:border-sage hover:text-sage-deep"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <label className="sr-only" htmlFor="revise-input">
          想怎麼改
        </label>
        <textarea
          id="revise-input"
          rows={2}
          maxLength={MAX}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send(text)
            }
          }}
          placeholder="例如：第二天晚餐換成燒肉"
          className="min-h-[44px] flex-1 resize-none rounded-2xl border border-transparent bg-field px-3 py-2.5 text-[15px] text-ink outline-none focus:border-sage disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="送出"
          className="grid size-11 shrink-0 place-items-center rounded-2xl border-0 bg-sage text-white disabled:opacity-40"
        >
          <Icon name="up" size={18} />
        </button>
      </form>
      <p className="m-0 mt-1.5 text-[12px] text-ink-soft tabular-nums">
        {left !== null ? `今天還能修改 ${left} 次・` : ''}
        {text.length}/{MAX}
      </p>
    </section>
  )
}
