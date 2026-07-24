'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, Maximize2 } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

export interface PropertyLocationCardProps {
  code: string
  location: string
  latitude: number | null
  longitude: number | null
  count: number
  href: string
}

/** Read-only mini-map card — the reference's "Property Location" widget: a small
 *  muted map with a single marker, count badge, and a bold location label below. */
export default function PropertyLocationCard({ code, location, latitude, longitude, count, href }: PropertyLocationCardProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (latitude == null || longitude == null) return
      const L = (await import('leaflet')).default
      if (cancelled || !mapContainerRef.current || mapRef.current) return

      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        touchZoom: false,
        attributionControl: false,
      }).setView([latitude, longitude], 13)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      L.marker([latitude, longitude]).addTo(map)

      mapRef.current = map
    }

    init()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [latitude, longitude])

  return (
    <div className="card overflow-hidden" data-animate="fade-up">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="h-section" style={{ color: 'var(--text-1)' }}>Property Location</h2>
        <Maximize2 size={14} style={{ color: 'var(--text-3)' }} />
      </div>

      <div className="relative mt-3 h-[150px] w-full" style={{ background: 'var(--surface-3)' }}>
        {latitude != null && longitude != null ? (
          <div ref={mapContainerRef} className="h-full w-full grayscale" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
            No coordinates on file
          </div>
        )}
        <span
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: 'var(--ink-900)', color: '#fff' }}
        >
          {count}
        </span>
      </div>

      <Link href={href} className="flex items-center justify-between gap-2 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{code}</p>
          <p className="truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{location}</p>
        </div>
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--ink-900)', color: '#fff' }}
        >
          <ArrowRight size={14} />
        </span>
      </Link>
    </div>
  )
}
