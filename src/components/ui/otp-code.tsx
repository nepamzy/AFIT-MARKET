'use client'
import { useRef, useState } from 'react'
import { cn } from './cn'

export type OtpStatus = 'idle' | 'checking' | 'ok' | 'bad'

/** The line and ring go from red, through yellow, to green as the code fills up. */
const hue = (fraction: number) => Math.round(Math.max(0, Math.min(1, fraction)) * 130)

/**
 * A code entry made of joined boxes, a colour line under them and a ring beside them.
 *
 * - One real input sits over the boxes, so it does not matter which box you tap first: the digits always go in order, first to
 *   last, and a pasted or auto-filled code fills every box.
 * - The line and ring move from red, through yellow, to green as digits are added. When the code is accepted the ring becomes a
 *   solid green circle with a check mark; when it is refused the boxes shake and everything turns red.
 * - `onComplete` runs once when all digits are there (the page may use it to send the code at once).
 */
export function OtpCode({
  name,
  label,
  value,
  onChange,
  length = 6,
  max,
  status = 'idle',
  onComplete,
  autoFocus,
  hint,
}: {
  name: string
  label: string
  value: string
  onChange: (v: string) => void
  length?: number
  /** the longest code that may be typed (extra boxes appear after `length` when it is longer) */
  max?: number
  status?: OtpStatus
  onComplete?: (form: HTMLFormElement | null) => void
  autoFocus?: boolean
  hint?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const limit = Math.max(length, max ?? length)
  const boxes = Math.max(length, Math.min(limit, value.length))
  const fraction = Math.min(1, value.length / length)
  // a refused code stays red only until the person changes it
  const [badFor, setBadFor] = useState<string | null>(null)
  if (status === 'bad' && badFor === null) setBadFor(value)
  if (status !== 'bad' && badFor !== null) setBadFor(null)
  const ok = status === 'ok'
  const bad = status === 'bad' && badFor === value
  const h = ok ? 130 : bad ? 0 : hue(fraction)
  const colour = `hsl(${h} 78% ${h > 45 && h < 100 ? 42 : 45}%)`

  const set = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, limit)
    onChange(digits)
    if (digits.length === length && value.length < length) onComplete?.(input.current?.form ?? null)
  }
  const toEnd = () => {
    const el = input.current
    if (el) requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`${name}-otp`} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div
            className={cn(
              'relative flex overflow-hidden rounded-[var(--radius-card)] border-2 bg-white transition-colors',
              bad && 'otp-shake',
            )}
            style={{ borderColor: colour }}
            onClick={() => input.current?.focus()}
          >
            {Array.from({ length: boxes }, (_, i) => {
              const d = value[i] ?? ''
              const active = i === Math.min(value.length, boxes - 1) && status !== 'ok'
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  className={cn(
                    'grid h-14 flex-1 place-items-center text-2xl font-extrabold text-navy-900 transition-colors',
                    i > 0 && 'border-l border-line',
                    active && 'bg-brand-50',
                  )}
                >
                  {d || (active ? <span className="h-6 w-0.5 animate-pulse bg-navy-900" /> : '')}
                </span>
              )
            })}
            <input
              ref={input}
              id={`${name}-otp`}
              name={name}
              value={value}
              onChange={(e) => set(e.target.value)}
              onFocus={toEnd}
              onClick={toEnd}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault()
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={limit}
              autoFocus={autoFocus}
              aria-describedby={hint ? `${name}-otp-hint` : undefined}
              aria-invalid={bad || undefined}
              className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            />
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Code progress"
            aria-valuemin={0}
            aria-valuemax={length}
            aria-valuenow={Math.min(value.length, length)}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${ok ? 100 : fraction * 100}%`, backgroundColor: colour }}
            />
          </div>
        </div>
        <div
          className="grid size-14 shrink-0 place-items-center rounded-full border-4 text-sm font-extrabold transition-colors"
          style={{
            borderColor: colour,
            backgroundColor: ok ? colour : 'transparent',
            color: ok ? 'white' : colour,
          }}
          role="status"
          aria-live="polite"
        >
          {ok ? (
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              aria-label="Correct"
              className="otp-pop"
            >
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : status === 'checking' ? (
            <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : bad ? (
            '!'
          ) : (
            `${Math.min(value.length, length)}/${length}`
          )}
        </div>
      </div>
      {hint && (
        <p id={`${name}-otp-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
