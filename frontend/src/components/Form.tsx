// Form building blocks shared by every page: soft filled fields, pill buttons, cards.
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export const inputCls =
  'w-full min-w-0 rounded-2xl border-2 border-transparent bg-field px-4 py-2.5 text-[16px] leading-snug text-ink outline-none transition-colors placeholder:text-[#9aa596] focus:border-sage focus:bg-white'

/** A filled field with an icon inside on the left, like the sign-up examples. */
export function IconInput({ icon, ...props }: { icon: IconName } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft">
        <Icon name={icon} />
      </span>
      <input {...props} className={`${inputCls} pl-11 ${props.className ?? ''}`} />
    </div>
  )
}

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
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[14px] text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="m-0 text-[13px] text-apricot-deep">{error}</p>
      ) : (
        hint && <p className="m-0 text-[13px] text-ink-soft">{hint}</p>
      )}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[28px] bg-cream shadow-[var(--shadow-card)] ${className}`}>{children}</div>
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = 'button',
  wide,
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  wide?: boolean
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border-0 bg-sage px-7 py-3 text-[16px] text-white shadow-[var(--shadow-soft)] transition-colors hover:bg-sage-deep disabled:cursor-not-allowed disabled:bg-[#b9c4b4] disabled:shadow-none ${
        wide ? 'w-full' : ''
      }`}
    >
      {children}
    </button>
  )
}

/** The bright "Next" pill from the questionnaire example. */
export function NextButton({ children, onClick, type = 'button' }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="rounded-2xl border-0 bg-lime px-6 py-2.5 text-[15px] text-ink shadow-[var(--shadow-soft)] transition-colors hover:bg-[#bde58a]"
    >
      {children}
    </button>
  )
}

export function TextButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border-0 bg-transparent px-3 py-2 text-[15px] whitespace-nowrap text-ink hover:text-sage-deep"
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
      className="shrink-0 rounded-full border-2 border-line bg-cream px-4 py-2 text-[14px] whitespace-nowrap text-ink transition-colors hover:border-sage hover:text-sage-deep"
    >
      {children}
    </button>
  )
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl bg-apricot-soft px-4 py-3 text-[14px] text-apricot-deep">
      {children}
    </div>
  )
}

/** Short dashes, one per step; the current one is long and dark. */
export function StepDashes({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i === current ? 'w-7 bg-ink' : i < current ? 'w-4 bg-sage' : 'w-4 bg-line'
          }`}
        />
      ))}
    </div>
  )
}
