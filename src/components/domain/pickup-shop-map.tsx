'use client'
import { useEffect, useState } from 'react'
import { LiveMap } from './live-map'

type PickupMap =
  | { active: false }
  | {
      active: true
      shop_name: string
      address: string | null
      shop: { lat: number; lng: number; age_seconds: number } | null
    }

/** For a customer collecting their own order: a map with the shop's position (the shop's phone shares it automatically). */
export function PickupShopMap({ orderId, mapKey }: { orderId: string; mapKey?: string | null }) {
  const [m, setM] = useState<PickupMap | null>(null)
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const r = await fetch(`/api/orders/${orderId}/pickup-map`, { cache: 'no-store' })
        if (r.ok && !stop) setM((await r.json()) as PickupMap)
      } catch {
        /* the next poll tries again */
      }
    }
    void load()
    const id = setInterval(load, 20_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [orderId])

  if (!m || !m.active) return null
  return (
    <div className="space-y-1">
      {m.shop && (
        <LiveMap
          pins={[{ id: 'shop', lat: m.shop.lat, lng: m.shop.lng, label: m.shop_name }]}
          mapKey={mapKey}
          label={`Map showing ${m.shop_name}`}
          height={240}
        />
      )}
      <p className="text-sm">
        {m.shop
          ? `${m.shop_name} is at the S pin.`
          : `${m.shop_name} has not shared its location yet.`}
        {m.address ? ` Pickup place: ${m.address}.` : ''}
      </p>
    </div>
  )
}
