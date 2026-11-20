'use client'
import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  generateRiderCodeAction,
  type RiderCodeState,
} from '@/server/modules/vendors-and-catalogue/actions'

const left = (iso: string, now: number) =>
  Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000))
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Makes a code for a new rider and counts down its 10 minutes. */
export function RiderCodeMaker({
  vendorId,
  active,
}: {
  vendorId: string
  /** codes made earlier that are still good */
  active: { code: string; expires_at: string }[]
}) {
  const [state, action, pending] = useActionState<RiderCodeState, FormData>(
    generateRiderCodeAction,
    {},
  )
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const shown =
    state.code && state.expiresAt ? [{ code: state.code, expires_at: state.expiresAt }] : active
  const live = shown.filter((c) => left(c.expires_at, now) > 0)
  return (
    <div className="space-y-3" data-testid="rider-code-maker">
      <form action={action}>
        <input type="hidden" name="vendorId" value={vendorId} />
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? 'Making a code…' : 'Generate code for a new rider'}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="font-medium text-danger-700">
          {state.error}
        </p>
      )}
      {live.map((c) => (
        <div
          key={c.code}
          className="rounded-[var(--radius-card)] border-2 border-gold-400 bg-accent-50/50 p-4"
        >
          <p className="text-sm text-muted">Give this code to your new rider</p>
          <p
            className="text-4xl font-extrabold tracking-[0.3em] text-navy-900"
            aria-label={`Rider code ${c.code.split('').join(' ')}`}
          >
            {c.code}
          </p>
          <p className="text-sm font-semibold">
            Works once. Time left: {mmss(left(c.expires_at, now))}
          </p>
        </div>
      ))}
    </div>
  )
}
