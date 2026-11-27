'use client'
import { useEffect, useState } from 'react'

const pad = (n: number) => String(n).padStart(2, '0')

/** A live timer to a moment (ISO text). Shows days, hours, minutes and seconds; says "overdue" with the time passed once the moment has gone. */
export function Countdown({ at }: { at: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [])
  if (now === null) return <span className="tabular-nums">…</span>
  const diff = new Date(at).getTime() - now
  const abs = Math.abs(diff)
  const d = Math.floor(abs / 86_400_000)
  const h = Math.floor((abs % 86_400_000) / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const s = Math.floor((abs % 60_000) / 1000)
  const text = `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`
  return (
    <span
      className={`tabular-nums font-extrabold ${diff < 0 ? 'text-danger-700' : abs < 3 * 86_400_000 ? 'text-accent-700' : 'text-navy-900'}`}
    >
      {diff < 0 ? `Overdue by ${text}` : text}
    </span>
  )
}
