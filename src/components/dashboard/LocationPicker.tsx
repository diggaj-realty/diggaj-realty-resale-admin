'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, MapPin } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

type NominatimResult = {
  lat: string
  lon: string
  display_name: string
  address?: {
    city?: string
    town?: string
    village?: string
    suburb?: string
    neighbourhood?: string
    postcode?: string
  }
}

export interface PickedLocation {
  lat: number
  lon: number
  city?: string
  locality?: string
  pincode?: string
}

/** Free OpenStreetMap-based location picker (Leaflet + Nominatim) — no API key
 *  or billing required. Lets a seller search an address or click the map to
 *  drop a pin; emits lat/lon plus best-effort city/locality/pincode. */
export default function LocationPicker({
  initialLat,
  initialLon,
  onPick,
}: {
  initialLat?: number | null
  initialLon?: number | null
  onPick: (loc: PickedLocation) => void
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    initialLat != null && initialLon != null ? { lat: initialLat, lon: initialLon } : null
  )

  useEffect(() => {
    let cancelled = false

    async function init() {
      const L = (await import('leaflet')).default
      if (cancelled || !mapContainerRef.current || mapRef.current) return

      // Bundlers break Leaflet's default marker icon URL resolution; point at the CDN instead.
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const startLat = initialLat ?? 12.9716
      const startLon = initialLon ?? 77.5946 // Bangalore fallback

      const map = L.map(mapContainerRef.current).setView([startLat, startLon], initialLat != null ? 15 : 11)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      if (initialLat != null && initialLon != null) {
        markerRef.current = L.marker([initialLat, initialLon]).addTo(map)
      }

      map.on('click', async (e: import('leaflet').LeafletMouseEvent) => {
        placeMarker(L, map, e.latlng.lat, e.latlng.lng)
        await reverseGeocode(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    }

    init()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function placeMarker(L: typeof import('leaflet'), map: import('leaflet').Map, lat: number, lon: number) {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon])
    } else {
      markerRef.current = L.marker([lat, lon]).addTo(map)
    }
    map.setView([lat, lon], Math.max(map.getZoom(), 15))
    setCoords({ lat, lon })
  }

  function extractLocality(address?: NominatimResult['address']): string | undefined {
    return address?.suburb || address?.neighbourhood || address?.town || address?.village
  }

  async function reverseGeocode(lat: number, lon: number) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
      )
      const data: NominatimResult = await res.json()
      onPick({
        lat,
        lon,
        city: data.address?.city,
        locality: extractLocality(data.address),
        pincode: data.address?.postcode,
      })
    } catch {
      onPick({ lat, lon })
    }
  }

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=in&limit=5&q=${encodeURIComponent(query)}`
      )
      const data: NominatimResult[] = await res.json()
      setResults(data)
    } finally {
      setSearching(false)
    }
  }

  async function selectResult(r: NominatimResult) {
    const lat = Number(r.lat)
    const lon = Number(r.lon)
    setResults([])
    setQuery(r.display_name)
    if (mapRef.current) {
      const L = (await import('leaflet')).default
      placeMarker(L, mapRef.current, lat, lon)
    }
    onPick({
      lat,
      lon,
      city: r.address?.city,
      locality: extractLocality(r.address),
      pincode: r.address?.postcode,
    })
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSearch()
            }
          }}
          placeholder="Search an address to place the pin..."
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        />
        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={searching}
          className="btn-accent flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-70"
        >
          <Search size={13} /> {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="mb-2 rounded-lg border text-xs" style={{ borderColor: 'var(--line)' }}>
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectResult(r)}
              className="flex w-full items-start gap-1.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-black/[0.03]"
              style={{ borderColor: 'var(--line)', color: 'var(--text-2)' }}
            >
              <MapPin size={13} className="mt-0.5 shrink-0" /> {r.display_name}
            </button>
          ))}
        </div>
      )}

      <div ref={mapContainerRef} className="h-64 w-full rounded-lg border" style={{ borderColor: 'var(--line)' }} />

      <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
        {coords
          ? `Pin set at ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)} — click the map to move it.`
          : 'Search an address or click the map to drop a pin.'}
        {' '}Map data &copy; OpenStreetMap contributors.
      </p>
    </div>
  )
}
