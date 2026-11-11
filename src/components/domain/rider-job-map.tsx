'use client'
import { useEffect, useState } from 'react'
import { LiveMap, type MapPin } from './live-map'

type JobMap =
  | { active: false }
  | {
      active: true
      stage?: 'to_shop' | 'to_customer'
      shop?: { label: string | null; lat: number; lng: number; age_seconds: number } | null
      shop_name?: string
      destination: { label: string | null; lat: number | null; lng: number | null }
      rider: { lat: number; lng: number; age_seconds: number } | null
      customer: {
        lat: number
        lng: number
        accuracy_m?: number
        age_seconds: number
        stale: boolean
      } | null
    }

/** The rider's map for one delivery: themselves, the delivery point, and the customer if they chose to share. */
export function RiderJobMap({
  assignmentId,
  mapKey,
}: {
  assignmentId: string
  mapKey?: string | null
}) {
  const [m, setM] = useState<JobMap | null>(null)
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const r = await fetch(`/api/rider/jobs/${assignmentId}/map`, { cache: 'no-store' })
        if (r.ok && !stop) setM((await r.json()) as JobMap)
      } catch {
        /* the next poll tries again */
      }
    }
    void load()
    const id = setInterval(load, 8_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [assignmentId])

  if (!m || !m.active) return null
  const toShop = m.stage === 'to_shop'
  const pins: MapPin[] = []
  if (m.shop)
    pins.push({ id: 'shop', lat: m.shop.lat, lng: m.shop.lng, label: m.shop.label ?? 'The shop' })
  if (m.rider) pins.push({ id: 'rider', lat: m.rider.lat, lng: m.rider.lng, label: 'You' })
  if (m.destination.lat != null && m.destination.lng != null)
    pins.push({
      id: 'destination',
      lat: m.destination.lat,
      lng: m.destination.lng,
      label: m.destination.label ?? 'Delivery point',
    })
  if (m.customer)
    pins.push({
      id: 'customer',
      lat: m.customer.lat,
      lng: m.customer.lng,
      label: 'Customer',
      stale: m.customer.stale,
      radiusM: m.customer.accuracy_m,
    })
  if (pins.length === 0 && !toShop) return null
  return (
    <div className="space-y-1">
      {pins.length > 0 && (
        <LiveMap pins={pins} mapKey={mapKey} label="Map of your delivery" height={240} />
      )}
      <p className="text-sm">
        {toShop
          ? m.shop
            ? `Head to ${m.shop_name ?? 'the shop'} (the S pin). This map changes to the customer once you have collected the order.`
            : `${m.shop_name ?? 'The shop'} has not shared its location yet. Use the address below, or ask the shop.`
          : m.customer
            ? m.customer.stale
              ? `The customer shared their location ${m.customer.age_seconds}s ago (out of date).`
              : (m.customer.accuracy_m ?? 0) >= 300
                ? `The customer is sharing roughly where they are (blue circle, about ${Math.round((m.customer.accuracy_m ?? 0) / 100) / 10} km wide). Ask them to move closer or call if you cannot find them.`
                : 'The customer is sharing where they are (blue pin).'
            : 'The customer has not shared their location. Head for the red flag.'}
      </p>
    </div>
  )
}
