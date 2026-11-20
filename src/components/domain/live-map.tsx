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
  const [streets, setStreets] = useState(false)

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
      if (now.length === 1) map.setView([now[0]!.lat, now[0]!.lng], 16)
      else
        map.fitBounds(L.latLngBounds(now.map((p) => [p.lat, p.lng] as [number, number])), {
          padding: [40, 40],
          maxZoom: 17,
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
      // Satellite pictures of some places stop at a lower zoom: past it the tiles are stretched instead of asking for
      // pictures that do not exist (which left a blank blue map).
      const imagery = L.tileLayer(`${host}/World_Imagery/MapServer/tile/{z}/{y}/{x}${q}`, {
        maxZoom: 19,
        maxNativeZoom: 17,
        attribution: 'Esri',
      }).addTo(map)
      const places = L.tileLayer(
        `${host}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}${q}`,
        { maxZoom: 19, maxNativeZoom: 17 },
      ).addTo(map)
      // If the satellite tiles do not arrive (blocked, slow, or no picture here), switch to the street map so the
      // person never stares at an empty screen.
      let loaded = false
      let errors = 0
      const toStreets = () => {
        if (loaded || cancelled) return
        loaded = true
        imagery.remove()
        places.remove()
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        }).addTo(map)
        setStreets(true)
      }
      imagery.on('tileload', () => {
        loaded = true
      })
      imagery.on('tileerror', () => {
        errors += 1
        if (errors >= 3) toStreets()
      })
      window.setTimeout(toStreets, 6000)
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

  // Expanded view: the map fills the whole screen (plain page layout: the browser full-screen mode left a blank map on phones), and the map is
  // told its new size.
  const resize = () => {
    for (const ms of [60, 250, 700])
      window.setTimeout(() => state.current?.map.invalidateSize(), ms)
  }
  useEffect(() => {
    resize()
    const onResize = () => resize()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      document.removeEventListener('keydown', onKey)
    }
  }, [full])
  const toggle = () => setFull((f) => !f)

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
      {/* The map element's class name must never change after the map starts: React would overwrite the classes Leaflet put
          on it and the map would turn into a blank blue box. Only the style changes when the map is expanded. */}
      <div
        ref={box}
        role="region"
        aria-label={label}
        style={{
          height: full ? '100dvh' : height,
          borderRadius: full ? 0 : 'var(--radius-card)',
          flex: full ? '1 1 0%' : undefined,
        }}
        className="afit-map w-full overflow-hidden border border-line bg-navy-950"
      />
      {!full && (
        <p className="mt-1 text-xs text-muted">
          {streets
            ? 'Map © OpenStreetMap contributors.'
            : 'Satellite imagery © Esri and its data providers.'}
        </p>
      )}
    </div>
  )
}
