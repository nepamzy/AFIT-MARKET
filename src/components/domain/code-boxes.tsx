'use client'
import { useRef } from 'react'

/** Five boxes for a 5-digit code. Typing moves on by itself; a pasted code fills all five. `value` holds up to 5 digits. */
export function CodeBoxes({
  value,
  onChange,
  label,
  idPrefix = 'code',
}: {
  value: string
  onChange: (v: string) => void
  label: string
  idPrefix?: string
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(5, ' ').slice(0, 5).split('')
  const set = (i: number, d: string) => {
    const arr = digits.map((x) => (x === ' ' ? '' : x))
    arr[i] = d
    onChange(arr.join('').slice(0, 5))
  }
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex gap-2" role="group" aria-label={label}>
        {digits.map((d, i) => (
          <input
            key={i}
            id={`${idPrefix}-${i + 1}`}
            ref={(el) => {
              refs.current[i] = el
            }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            pattern="[0-9]"
            aria-label={`Digit ${i + 1} of 5`}
            value={d === ' ' ? '' : d}
            className="size-12 rounded-[var(--radius-control)] border-2 border-line-strong bg-white text-center text-xl font-bold"
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(-1)
              set(i, v)
              if (v && i < 4) refs.current[i + 1]?.focus()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus()
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5)
              if (!text) return
              e.preventDefault()
              onChange(text)
              refs.current[Math.min(text.length, 4)]?.focus()
            }}
          />
        ))}
      </div>
    </fieldset>
  )
}
