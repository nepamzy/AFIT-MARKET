'use client'
import { useEffect, useState } from 'react'
import { LiveMap, type MapPin } from './live-map'

type RiderMap =
  | { active: false }
  | {
      active: true
      rider_name: string | null
      rider: { lat: number; lng: number; age_seconds: number; stale: boolean } | null
      shop: { lat: number; lng: number } | null
    }

/** For the shop, while a rider is on the way to collect an order: the rider and the shop on one map. */
export function ShopRiderMap({ orderId, mapKey }: { orderId: string; mapKey?: string | null }) {
  const [m, setM] = useState<RiderMap | null>(null)
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const r = await fetch(`/api/vendor/orders/${orderId}/rider-map`, { cache: 'no-store' })
        if (r.ok && !stop) setM((await r.json()) as RiderMap)
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
  }, [orderId])

  if (!m || !m.active) return null
  const who = m.rider_name ?? 'Your rider'
  const pins: MapPin[] = []
  if (m.shop) pins.push({ id: 'shop', lat: m.shop.lat, lng: m.shop.lng, label: 'Your shop' })
  if (m.rider) pins.push({ id: 'rider', lat: m.rider.lat, lng: m.rider.lng, label: who })
  return (
    <div className="space-y-1">
      {pins.length > 0 && (
        <LiveMap pins={pins} mapKey={mapKey} label={`Map showing ${who} on the way`} height={220} />
      )}
      <p className="text-sm">
        {m.rider
          ? m.rider.stale
            ? `${who} shared their position ${m.rider.age_seconds}s ago (out of date).`
            : `${who} is on the way to you (the rider pin).`
          : `${who} has not shared a position yet.`}
      </p>
    </div>
  )
}
