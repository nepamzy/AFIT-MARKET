'use client'
import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'

export type MapPin = {
  id: 'rider' | 'customer' | 'destination' | 'me' | 'shop'
  lat: number
  lng: number
  label: string
  /** Last update is old: the pin is drawn faded. */
  stale?: boolean
  /** How roughly the position is known, in metres: drawn as a circle when it is wide enough to matter. */
  radiusM?: number
}

// People are drawn above the delivery-point flag, so a rider standing at the flag is still visible.
const Z: Record<MapPin['id'], number> = {
  rider: 1000,
  customer: 900,
  me: 900,
  shop: 500,
  destination: 0,
}
const CLASS: Record<MapPin['id'], string> = {
  rider: 'afit-pin afit-pin-rider',
  customer: 'afit-pin afit-pin-customer',
  me: 'afit-pin afit-pin-customer',
  destination: 'afit-pin afit-pin-destination',
  shop: 'afit-pin afit-pin-destination',
}
const TEXT: Record<MapPin['id'], string> = {
  rider: 'R',
  customer: 'C',
  me: 'Me',
  shop: 'S',
  destination: '⚑',
}

/**
 * Satellite map (Esri World Imagery tiles + place labels) with a pin for each person or place. Pins move as the props
 * change; the view re-fits only when a pin appears or disappears, so a person who zooms in is not pulled back.
 */
const FREE_HOST = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const KEYED_HOST = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services'

export function LiveMap({
  pins,
  label,
  height = 280,
  mapKey,
}: {
  pins: MapPin[]
  label: string
  height?: number
  /** ArcGIS Location Platform API key. It is public by design: restrict it to the site's address in the ArcGIS dashboard. */
  mapKey?: string | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const state = useRef<{
    map: import('leaflet').Map
    L: typeof import('leaflet')
    markers: Map<string, import('leaflet').Marker>
    circles: Map<string, import('leaflet').Circle>
    fitted: string
  } | null>(null)
  const latest = useRef(pins)
  const wrap = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)

  const sync = () => {
    const s = state.current
    if (!s) return
    const { L, map, markers, circles } = s
    const now = latest.current
    for (const [id, m] of markers)
      if (!now.some((p) => p.id === id)) {
        m.remove()
        markers.delete(id)
      }
    for (const [id, c] of circles)
      if (!now.some((p) => p.id === id && (p.radiusM ?? 0) >= 60)) {
        c.remove()
        circles.delete(id)
      }
    // A rough position is drawn as a circle, so nobody mistakes "somewhere around here" for an exact spot.
    for (const p of now) {
      if ((p.radiusM ?? 0) < 60) continue
      const c = circles.get(p.id)
      if (c) {
        c.setLatLng([p.lat, p.lng])
        c.setRadius(p.radiusM!)
      } else
        circles.set(
          p.id,
          L.circle([p.lat, p.lng], {
            radius: p.radiusM!,
            className: 'afit-accuracy',
            weight: 2,
            interactive: false,
          }).addTo(map),
        )
    }
    for (const p of now) {
      const icon = L.divIcon({
        className: '',
        html: `<span class="${CLASS[p.id]}${p.stale ? ' afit-pin-stale' : ''}">${TEXT[p.id]}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      })
      const m = markers.get(p.id)
      if (m) {
        m.setLatLng([p.lat, p.lng])
        m.setIcon(icon)
      } else {
        const created = L.marker([p.lat, p.lng], {
          icon,
          title: p.label,
          keyboard: false,
          zIndexOffset: Z[p.id],
        }).addTo(map)
        markers.set(p.id, created)
      }
    }
    const key = now
      .map((p) => p.id)
      .sort()
      .join(',')
    if (key !== s.fitted && now.length) {
      s.fitted = key
      if (now.length === 1) map.setView([now[0]!.lat, now[0]!.lng], 17)
      else
        map.fitBounds(L.latLngBounds(now.map((p) => [p.lat, p.lng] as [number, number])), {
          padding: [40, 40],
          maxZoom: 18,
        })
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !box.current) return
      const first = latest.current[0]
      const map = L.map(box.current, {
        center: first ? [first.lat, first.lng] : [0, 0],
        zoom: first ? 16 : 2,
        attributionControl: false,
      })
      // With an ArcGIS Location Platform key the maps are metered to the owner's own account; without one the free
      // public tiles are used.
      const host = mapKey ? KEYED_HOST : FREE_HOST
      const q = mapKey ? `?token=${encodeURIComponent(mapKey)}` : ''
      L.tileLayer(`${host}/World_Imagery/MapServer/tile/{z}/{y}/{x}${q}`, {
        maxZoom: 19,
        attribution: 'Esri',
      }).addTo(map)
      L.tileLayer(`${host}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}${q}`, {
        maxZoom: 19,
      }).addTo(map)
      state.current = { map, L, markers: new Map(), circles: new Map(), fitted: '' }
      sync()
    })()
    return () => {
      cancelled = true
      state.current?.map.remove()
      state.current = null
    }
  }, [mapKey])

  useEffect(() => {
    latest.current = pins
    sync()
  })

  // Expanded view: the map fills the whole screen (uses the browser's full-screen mode where it exists, so the phone can
  // be turned sideways), and the map is told its new size.
  const resize = () => window.setTimeout(() => state.current?.map.invalidateSize(), 80)
  useEffect(() => {
    resize()
    const onResize = () => resize()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false)
    }
    const onFs = () => {
      if (!document.fullscreenElement) setFull(false)
      resize()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [full])
  const toggle = async () => {
    if (!full) {
      setFull(true)
      try {
        await wrap.current?.requestFullscreen?.()
      } catch {
        /* no full-screen mode: the map still fills the page */
      }
    } else {
      setFull(false)
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
    }
  }

  return (
    <div
      ref={wrap}
      className={full ? 'fixed inset-0 z-[3000] flex flex-col bg-navy-950' : 'relative'}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={full ? 'Close the full-screen map' : 'Expand the map to fill the screen'}
        className="touch-target absolute right-2 top-2 z-[1000] rounded-full bg-white px-4 py-2 text-sm font-bold text-navy-900 shadow-lg"
      >
        {full ? '✕ Close map' : '⛶ Expand map'}
      </button>
      <div
        ref={box}
        role="region"
        aria-label={label}
        style={{ height: full ? '100%' : height }}
        className={`afit-map w-full overflow-hidden border border-line bg-navy-950 ${full ? 'flex-1 rounded-none' : 'rounded-[var(--radius-card)]'}`}
      />
      {!full && (
        <p className="mt-1 text-xs text-muted">Satellite imagery © Esri and its data providers.</p>
      )}
    </div>
  )
}
