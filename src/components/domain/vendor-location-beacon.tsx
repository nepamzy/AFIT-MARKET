'use client'
import { useEffect } from 'react'
import { postVendorLocationAction } from '@/server/modules/location/vendor-actions'

/**
 * Sends the shop's position now and then while the shop's orders screen is open, so a rider on the way to collect an order
 * can see where the shop is. Automatic: there is nothing to switch on. Renders nothing; if the phone blocks location, nothing happens.
 */
export function VendorLocationBeacon() {
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    let last = 0
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - last < 30_000) return
        last = now
        void postVendorLocationAction({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        })
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])
  return null
}
