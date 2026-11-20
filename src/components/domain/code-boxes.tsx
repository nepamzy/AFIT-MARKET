'use client'
import { useRef } from 'react'

/** Boxes for a numeric code (5 digits unless `length` says otherwise). Typing moves on by itself; a pasted code fills them all. */
export function CodeBoxes({
  value,
  onChange,
  label,
  idPrefix = 'code',
  length = 5,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  idPrefix?: string
  length?: number
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(length, ' ').slice(0, length).split('')
  const set = (i: number, d: string) => {
    const arr = digits.map((x) => (x === ' ' ? '' : x))
    arr[i] = d
    onChange(arr.join('').slice(0, length))
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
            aria-label={`Digit ${i + 1} of ${length}`}
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
              const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
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
