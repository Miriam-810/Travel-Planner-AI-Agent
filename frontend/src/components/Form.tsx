// Small form building blocks shared by the request form and the outline review.
import type { ReactNode } from 'react'

export const inputCls =
  'w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-[16px] leading-snug text-ink outline-none transition-colors placeholder:text-[#b3a99f] focus:border-coral'

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[13px] font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="m-0 text-[12.5px] font-bold text-coral-deep">{error}</p>
      ) : (
        hint && <p className="m-0 text-[12.5px] text-ink-soft">{hint}</p>
      )}
    </div>
  )
}

export function Section({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white/70 p-4 sm:p-5">
      <div className="mb-3">
        <div className="font-mono text-[10.5px] font-bold tracking-[.14em] text-coral uppercase">{kicker}</div>
        <h2 className="m-0 text-[16px] font-bold">{title}</h2>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border-0 bg-coral px-6 py-3 text-[15px] font-bold text-white shadow-[0_8px_18px_-10px_rgba(178,74,37,.9)] transition-colors hover:bg-coral-deep disabled:cursor-not-allowed disabled:bg-[#d9c9bc] disabled:shadow-none"
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border border-line bg-white px-4 py-2 text-[14px] font-bold whitespace-nowrap text-ink transition-colors hover:border-coral hover:text-coral-deep"
    >
      {children}
    </button>
  )
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-r-xl border-l-[3px] border-coral bg-coral-soft px-3 py-2.5 text-[14px] text-coral-deep">
      {children}
    </div>
  )
}
