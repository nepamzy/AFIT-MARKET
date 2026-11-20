'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type Perm = 'granted' | 'prompt' | 'denied' | 'unknown'

/**
 * Shows an "Allow location" button when the browser has not been given location access yet. Tapping it makes the phone show
 * its own permission question. If location was blocked before, the browser will not ask again, so we say where to switch it
 * on. Renders nothing once location is allowed.
 */
export function AllowLocationButton({ className }: { className?: string }) {
  const [perm, setPerm] = useState<Perm>('unknown')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let status: PermissionStatus | null = null
    let alive = true
    const read = (s: PermissionStatus) => alive && setPerm(s.state as Perm)
    void (async () => {
      try {
        status = (await navigator.permissions?.query({ name: 'geolocation' })) ?? null
        if (status) {
          read(status)
          status.onchange = () => status && read(status)
        }
      } catch {
        /* no permissions API (some phones): the button simply stays visible */
      }
    })()
    return () => {
      alive = false
      if (status) status.onchange = null
    }
  }, [])

  if (perm === 'granted' || (typeof navigator !== 'undefined' && !('geolocation' in navigator)))
    return null

  const ask = () => {
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      () => {
        setPerm('granted')
        setBusy(false)
      },
      (err) => {
        setPerm(err.code === 1 ? 'denied' : 'prompt')
        setBusy(false)
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  }
  return (
    <div className={className} role="group" aria-label="Location">
      {perm === 'denied' ? (
        <p className="rounded-[var(--radius-control)] bg-warning-50 px-3 py-2 text-sm text-warning-700">
          Location is blocked for this site. Tap the lock or settings icon next to the address bar,
          choose Site settings, then set Location to Allow. Then tap the button again.
        </p>
      ) : null}
      <Button type="button" variant="gold" onClick={ask} disabled={busy} className="mt-2">
        {busy ? 'Waiting for your phone…' : '📍 Allow location'}
      </Button>
    </div>
  )
}
