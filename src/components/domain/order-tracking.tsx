'use client'
import { useEffect, useState } from 'react'
import { LiveMap, type MapPin } from './live-map'

type Tracking =
  | { tracking: false; reason: string; status?: string }
  | {
      tracking: true
      status: string
      rider: { lat: number; lng: number; accuracy_m: number; age_seconds: number; stale: boolean }
      destination: {
        label: string | null
        lat: number | null
        lng: number | null
        radius_m?: number
        synthetic: boolean
      }
      arrival_detected: boolean
      estimate?: { distance: string; eta: string; note: string } | null
    }

const WHY: Record<string, string> = {
  not_in_transit: 'Live tracking starts once your rider has collected your order from the shop.',
  no_active_assignment: 'No rider is carrying your order right now.',
  rider_not_sharing: 'The rider is not sharing a location at the moment.',
  no_location_yet: 'Waiting for the rider’s first location update…',
}

/** Polls a protected server route (no direct database access, no Realtime) every 15 seconds. */
export function OrderTracking({ orderId, mapKey }: { orderId: string; mapKey?: string | null }) {
  const [t, setT] = useState<Tracking | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const r = await fetch(`/api/orders/${orderId}/tracking`, { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        if (!stop) {
          setT((await r.json()) as Tracking)
          setErr(false)
        }
      } catch {
        if (!stop) setErr(true)
      }
    }
    void load()
    const id = setInterval(load, 15_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [orderId])

  const pins: MapPin[] = []
  if (t && t.tracking)
    pins.push({
      id: 'rider',
      lat: t.rider.lat,
      lng: t.rider.lng,
      label: 'Your rider',
      stale: t.rider.stale,
    })
  const dest = t && 'destination' in t ? t.destination : undefined
  if (dest && dest.lat != null && dest.lng != null)
    pins.push({
      id: 'destination',
      lat: dest.lat,
      lng: dest.lng,
      label: dest.label ?? 'Delivery point',
    })

  const body = !t ? (
    <p role="status">{err ? 'Tracking is unavailable right now.' : 'Loading tracking…'}</p>
  ) : !t.tracking ? (
    <p role="status">{WHY[t.reason] ?? 'Tracking is unavailable.'}</p>
  ) : (
    <>
      <p>
        <strong>Rider:</strong>{' '}
        {t.rider.stale ? `last seen ${t.rider.age_seconds}s ago (location is out of date)` : 'live'}
        {t.destination.label ? ` · Destination: ${t.destination.label}` : ''}
      </p>
      {t.rider.stale && (
        <p className="font-medium text-warning-700">
          We have not had a recent update from the rider. This is not a problem with your order.
        </p>
      )}
      {t.arrival_detected && (
        <p className="font-semibold">
          The rider has reached your delivery point. Confirm by scanning the rider’s QR code, or
          show your own QR code to the rider.
        </p>
      )}
      {t.estimate && (
        <p>
          <strong>{t.estimate.distance}</strong>, {t.estimate.eta}.{' '}
          <span className="text-sm text-muted">{t.estimate.note}</span>
        </p>
      )}
    </>
  )

  return (
    <div className="space-y-3" aria-live="polite">
      {pins.length > 0 && (
        <LiveMap
          pins={pins}
          mapKey={mapKey}
          label="Live map showing your rider and your delivery point"
        />
      )}
      {body}
    </div>
  )
}
