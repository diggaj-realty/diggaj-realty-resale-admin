'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, MapPin } from 'lucide-react'

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

export interface PickedLocation {
  lat: number
  lon: number
  city?: string
  locality?: string
  pincode?: string
}

declare global {
  interface Window {
    google: typeof google
    __gmapsLoadPromise?: Promise<void>
  }
}

function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps) return Promise.resolve()
  if (window.__gmapsLoadPromise) return window.__gmapsLoadPromise
  window.__gmapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })
  return window.__gmapsLoadPromise
}

function extractAddressParts(components: google.maps.GeocoderAddressComponent[] | undefined) {
  const find = (type: string) => components?.find((c) => c.types.includes(type))?.long_name
  return {
    city: find('locality') || find('administrative_area_level_2'),
    locality: find('sublocality') || find('sublocality_level_1') || find('neighborhood'),
    pincode: find('postal_code'),
  }
}

/** Google Maps-based location picker. Lets a seller search an address or click
 *  the map to drop a pin; emits lat/lon plus best-effort city/locality/pincode. */
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
  const inputRef = useRef<HTMLInputElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.Marker | null>(null)
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    initialLat != null && initialLon != null ? { lat: initialLat, lon: initialLon } : null
  )
  const [error, setError] = useState(false)

  function placeMarker(map: google.maps.Map, lat: number, lon: number) {
    const position = { lat, lng: lon }
    if (markerRef.current) {
      markerRef.current.setPosition(position)
    } else {
      markerRef.current = new window.google.maps.Marker({ position, map })
    }
    map.setCenter(position)
    map.setZoom(Math.max(map.getZoom() ?? 11, 15))
    setCoords({ lat, lon })
  }

  function reverseGeocode(lat: number, lon: number) {
    geocoderRef.current?.geocode({ location: { lat, lng: lon } }, (results, status) => {
      if (status === window.google.maps.GeocoderStatus.OK && results?.[0]) {
        const { city, locality, pincode } = extractAddressParts(results[0].address_components)
        onPick({ lat, lon, city, locality, pincode })
      } else {
        onPick({ lat, lon })
      }
    })
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!GOOGLE_MAPS_KEY) {
        setError(true)
        return
      }
      try {
        await loadGoogleMaps()
      } catch {
        if (!cancelled) setError(true)
        return
      }
      if (cancelled || !mapContainerRef.current || mapRef.current) return

      const startLat = initialLat ?? 12.9716
      const startLon = initialLon ?? 77.5946 // Bangalore fallback

      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: startLat, lng: startLon },
        zoom: initialLat != null ? 15 : 11,
        streetViewControl: false,
        mapTypeControl: false,
      })
      geocoderRef.current = new window.google.maps.Geocoder()

      if (initialLat != null && initialLon != null) {
        markerRef.current = new window.google.maps.Marker({ position: { lat: initialLat, lng: initialLon }, map })
      }

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return
        const lat = e.latLng.lat()
        const lon = e.latLng.lng()
        placeMarker(map, lat, lon)
        reverseGeocode(lat, lon)
      })

      mapRef.current = map

      if (inputRef.current) {
        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'in' },
          fields: ['geometry', 'address_components', 'formatted_address'],
        })
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          const loc = place.geometry?.location
          if (!loc) return
          const lat = loc.lat()
          const lon = loc.lng()
          placeMarker(map, lat, lon)
          const { city, locality, pincode } = extractAddressParts(place.address_components)
          setCoords({ lat, lon })
          onPick({ lat, lon, city, locality, pincode })
        })
      }
    }

    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div className="mb-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search an address to place the pin..."
          disabled={error}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-60"
          style={{ borderColor: 'var(--line)', color: 'var(--text-1)', background: 'var(--surface)' }}
        />
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 rounded-lg border px-3 py-6 text-center text-xs" style={{ borderColor: 'var(--line)', color: 'var(--text-3)' }}>
          <MapPin size={13} className="shrink-0" /> Map unavailable — enter coordinates manually.
        </p>
      ) : (
        <div ref={mapContainerRef} className="h-64 w-full rounded-lg border" style={{ borderColor: 'var(--line)' }} />
      )}

      <p className="mt-1.5 flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
        <Search size={11} className="shrink-0" />
        {coords
          ? `Pin set at ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)} — click the map to move it.`
          : 'Search an address or click the map to drop a pin.'}
      </p>
    </div>
  )
}
